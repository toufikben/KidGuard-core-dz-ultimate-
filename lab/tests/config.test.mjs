import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderConfig } from '../scripts/render-config.mjs';
import { validateConfig } from '../scripts/check-config.mjs';
import { readFile } from 'node:fs/promises';

const template = await readFile(
  new URL('../traccar/kidguard-lab.template.xml', import.meta.url), 'utf8');

const env = {
  LAB_ADMIN_EMAIL: 'lab@example.com',
  LAB_ADMIN_PASSWORD: 'p@ss&w0rd',
  LAB_TELEGRAM_BOT_TOKEN: '123:ABC',
  LAB_TELEGRAM_CHAT_ID: '-100987',
  LAB_FORWARD_PORT: '5199',
};

test('template passes structural validation with placeholders allowed', () => {
  const { errors } = validateConfig(template, { allowPlaceholders: true });
  assert.deepEqual(errors, [], errors.join('\n'));
});

test('render substitutes every placeholder, escapes XML and defaults the port', () => {
  const out = renderConfig(template, env);
  assert.ok(!out.includes('${'), 'no placeholder may survive');
  assert.ok(out.includes("<entry key='event.forward.url'>http://127.0.0.1:5199/alert</entry>"),
    'LAB_FORWARD_PORT must default to 5199');
  const { errors } = validateConfig(out, { allowPlaceholders: false });
  assert.deepEqual(errors, [], errors.join('\n'));
});

test('render escapes XML metacharacters in injected values', () => {
  const escaped = renderConfig("<entry key='x'>${LAB_ADMIN_PASSWORD}</entry>", env);
  assert.equal(escaped, "<entry key='x'>p@ss&amp;w0rd</entry>");
});

test('render fails loudly on a missing secret', () => {
  assert.throws(() => renderConfig(template, {}), /missing env:/);
});

test('validation rejects a wrong protocols.enable', () => {
  const bad = template.replace(
    "<entry key='protocols.enable'>gt06,owntracks,osmand</entry>",
    "<entry key='protocols.enable'>tk103</entry>");
  const { errors } = validateConfig(bad, { allowPlaceholders: true });
  assert.ok(errors.some((e) => e.includes('protocols.enable')));
});

test('validation rejects a committed secret-shaped value', () => {
  const leaked = template.replace(
    "<entry key='notificator.telegram.key'>${LAB_TELEGRAM_BOT_TOKEN}</entry>",
    "<entry key='notificator.telegram.key'>123456:REAL-TOKEN</entry>");
  const { errors } = validateConfig(leaked, { allowPlaceholders: true });
  assert.ok(errors.some((e) => e.includes('placeholder')));
});

// Fix 1 (BLOCKER): Traccar EventForwarderJson.java does header.split("\\r?\\n") then
// line.split(":", 2) and dereferences values[1]; a colon-less header line throws
// ArrayIndexOutOfBoundsException synchronously inside forward().
test('Fix1: rendered forward header is a colon-separated Name: value pair', () => {
  const out = renderConfig(template, env);
  const { entries } = validateConfig(out, { allowPlaceholders: false });
  const header = entries.get('event.forward.header');
  assert.ok(header, 'event.forward.header entry must be present');
  for (const line of header.split(/\r?\n/)) {
    const idx = line.indexOf(':'); // emulate Java line.split(":", 2): first colon splits, rest stays
    assert.ok(idx >= 0, `header line "${line}" must contain a colon`);
    assert.notEqual(line.slice(0, idx).trim(), '', 'header name half must be non-empty');
    assert.notEqual(line.slice(idx + 1).trim(), '', 'header value half must be non-empty');
  }
});

test('Fix1: validateConfig rejects a forward header without a colon', () => {
  const bad = template.replace(
    /<entry key='event\.forward\.header'>[^<]*<\/entry>/,
    "<entry key='event.forward.header'>lab-sign-no-colon</entry>");
  const { errors } = validateConfig(bad, { allowPlaceholders: true });
  assert.ok(errors.some((e) => e.includes('event.forward.header')),
    `colon-less header must fail the event.forward.header rule, got: ${errors.join('\n')}`);
});

// Fix 2 (IMPORTANT): renderer must fail loudly on ANY unresolved placeholder, not just REQUIRED.
test('Fix2: render throws on a placeholder present in neither env nor defaults', () => {
  const t = "<entry key='x'>http://${LAB_NOPE}/alert</entry>";
  assert.throws(() => renderConfig(t, env), /missing env:/);
});

test('Fix2: render does not silently emit an empty value for a present-but-blank env var', () => {
  const badEnv = { ...env, LAB_SINK_HOST: '' };
  assert.throws(() => renderConfig(template, badEnv), /missing env:/);
});

// Reviewer A (final review) found the checker enforced neither of the two facts the M0 evidence
// measured. The geocoder one is worse than a missing lint rule: lab/traccar/kidguard-lab.xml is
// git-ignored and regenerated from this template by `npm run lab:render`, so a fix that lives
// only in the rendered file is dropped by the next run — and 005-fanout.md §6b measured that the
// enabled geocoder stalls delivery and leaks a resolved address built from the coordinates.
test('the template carries geocoder.enable=false so a re-render cannot drop it', () => {
  assert.match(renderConfig(template, env), /<entry key='geocoder\.enable'>false<\/entry>/);
});

test('validation rejects a lab config that enables the geocoder', () => {
  const bad = template.replace(
    "<entry key='geocoder.enable'>false</entry>",
    "<entry key='geocoder.enable'>true</entry>");
  assert.notEqual(bad, template, 'the template must carry a geocoder.enable entry to flip');
  const { errors } = validateConfig(bad, { allowPlaceholders: true });
  assert.ok(errors.some((e) => e.includes('geocoder.enable')), errors.join('\n'));
});

// notificator.types=web,mail is what keeps api.telegram.org unreachable from any lab run;
// the fake token entries stay only to prove the placeholder path, so the list itself is the gate.
test('validation rejects telegram in notificator.types', () => {
  const bad = template.replace(
    "<entry key='notificator.types'>web,mail</entry>",
    "<entry key='notificator.types'>web,mail,telegram</entry>");
  assert.notEqual(bad, template);
  const { errors } = validateConfig(bad, { allowPlaceholders: true });
  assert.ok(errors.some((e) => e.includes('notificator.types')), errors.join('\n'));
});

test('validation rejects a lab config with no geocoder.enable at all', () => {
  const bad = template.replace(/<entry key='geocoder\.enable'>[^<]*<\/entry>\n?/, '');
  const { errors } = validateConfig(bad, { allowPlaceholders: true });
  assert.ok(errors.some((e) => e.includes('geocoder.enable')), errors.join('\n'));
});
