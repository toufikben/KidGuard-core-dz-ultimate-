import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

const REQUIRED = [
  'LAB_ADMIN_EMAIL', 'LAB_ADMIN_PASSWORD',
  'LAB_TELEGRAM_BOT_TOKEN', 'LAB_TELEGRAM_CHAT_ID',
];

const DEFAULTS = {
  LAB_FORWARD_PORT: '5199',
  LAB_SINK_HOST: '127.0.0.1',
  LAB_FORWARD_TOKEN: 'kidguard-lab',
  LAB_LAN_HOST: '',
};

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function renderConfig(template, env) {
  const missing = REQUIRED.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`missing env: ${missing.join(', ')}`);
  }
  // Resolve every placeholder from `env` first, then `DEFAULTS`. A placeholder that is
  // absent from both — or present in `env` but blank — is an error: silently rendering it
  // as an empty string produced values like `http://:/alert` that still pass validation.
  const unresolved = new Set();
  const rendered = template.replace(/\$\{([A-Z0-9_]+)\}/g, (marker, name) => {
    const value = Object.prototype.hasOwnProperty.call(env, name) ? env[name] : DEFAULTS[name];
    if (value === undefined || value === '') {
      unresolved.add(name);
      return marker;
    }
    return escapeXml(value);
  });
  if (unresolved.size > 0) {
    throw new Error(`missing env: ${[...unresolved].sort().join(', ')}`);
  }
  return rendered;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const template = await readFile(
    new URL('../traccar/kidguard-lab.template.xml', import.meta.url), 'utf8');
  const target = new URL('../traccar/kidguard-lab.xml', import.meta.url);
  await writeFile(target, renderConfig(template, process.env), 'utf8');
  console.log(`wrote ${fileURLToPath(target)} (lab-only, gitignored)`);
}
