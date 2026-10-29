import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateRutClient, formatRutInput } from '../src/utils/rut.js';

const casesUrl = new URL('../../shared/rut-cases.json', import.meta.url);
const cases = JSON.parse(readFileSync(fileURLToPath(casesUrl), 'utf8'));

test('frontend RUT rules match the shared cross-runtime cases', () => {
  for (const item of cases) {
    assert.equal(
      validateRutClient(item.value).valid,
      item.valid,
      `validity for ${JSON.stringify(item.value)}`,
    );
    if (item.valid)
      assert.equal(formatRutInput(item.value), item.formatted, `format for ${item.value}`);
  }
});
