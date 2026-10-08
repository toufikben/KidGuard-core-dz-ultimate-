import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The gate is the count floor in .github/workflows/m1-ci.yml. This test guards the thing
// that floor depends on: if the test:app script or its glob changes, files stop being
// collected and the run goes green with zero real tests (measured: tests 0 exits 0).
test('npm run test:app still points at the tests/app glob the CI floor counts', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['test:app'], 'node --import tsx --test "tests/app/*.test.ts"');
});
