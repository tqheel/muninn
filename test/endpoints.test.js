import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACR_HOSTS, AUDD_ENDPOINTS, CUSTOM, selectionFor, valueFor } from '../web/endpoints.js';
import { DEFAULTS } from '../web/settings.js';

test('a preset maps to itself with an empty custom box', () => {
  assert.deepEqual(selectionFor(ACR_HOSTS, ACR_HOSTS[1].value), { choice: ACR_HOSTS[1].value, custom: '' });
});

test('an unknown value is shown as custom', () => {
  assert.deepEqual(selectionFor(ACR_HOSTS, 'identify-xx.acrcloud.com'), { choice: CUSTOM, custom: 'identify-xx.acrcloud.com' });
});

test('a blank AudD endpoint means automatic', () => {
  assert.deepEqual(selectionFor(AUDD_ENDPOINTS, ''), { choice: '', custom: '' });
});

test('valueFor round-trips both kinds', () => {
  assert.equal(valueFor(CUSTOM, ' identify-xx.acrcloud.com '), 'identify-xx.acrcloud.com');
  assert.equal(valueFor(ACR_HOSTS[0].value, 'ignored'), ACR_HOSTS[0].value);
});

test('each service keeps its own saved fields', () => {
  for (const k of ['token', 'endpoint', 'acrHost', 'acrKey', 'acrSecret']) assert.ok(k in DEFAULTS);
});
