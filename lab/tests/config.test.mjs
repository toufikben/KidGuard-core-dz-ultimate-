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
