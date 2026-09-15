import test from 'node:test';
import assert from 'node:assert/strict';

import { resetDemoData } from '../src/demoReset.js';
import { resetScenario, scenario, setActivePersona } from '../src/domain/scenario.js';

test.afterEach(() => {
  resetScenario();
  setActivePersona('admin-demo');
});

test('local demo restart preserves the active persona while resetting scenario data', () => {
  setActivePersona('partner-demo');
  assert.equal(scenario.activePersonaId, 'partner-demo');

  const message = resetDemoData();

  assert.equal(scenario.activePersonaId, 'partner-demo');
  assert.match(message, /still signed in/i);
});
