import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LAB_ROOT = fileURLToPath(new URL('../', import.meta.url));

test('lab tree skeleton exists', () => {
  for (const relative of ['README.md', 'traccar/run.sh', '.gitignore', 'tests']) {
    assert.ok(existsSync(`${LAB_ROOT}${relative}`), `missing lab/${relative}`);
  }
});
