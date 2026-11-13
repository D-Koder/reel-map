import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceCountry } from './country.js';

test('the country comes from the phone region, first usable language wins', () => {
  assert.equal(deviceCountry(['en-AU']), 'Australia');
  assert.equal(deviceCountry(['en', 'fr-CA', 'en-AU']), 'Canada');
  assert.equal(deviceCountry(['zh-Hant-TW']), 'Taiwan');
});

test('no region, nothing readable, or nothing at all gives an empty country', () => {
  assert.equal(deviceCountry(['en']), '');
  assert.equal(deviceCountry(['not a tag!!']), '');
  assert.equal(deviceCountry([]), '');
  assert.equal(deviceCountry(null), '');
});
