import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, applyAction } from '../lib/reflex/world';
import { observe } from '../lib/reflex/sensors';
import { Controller, validateDecision } from '../lib/reflex/controller';
import {
  MockDecisionProvider,
  MockStrategyProvider,
  JevDecisionProvider,
  chooseMockDecision,
} from '../lib/reflex/providers';
import { ACTIONS } from '../lib/reflex/types';
import {
  callJev,
  jevRequest,
  parseJevResponse,
} from '../lib/reflex/jev-server';

test('seeded world is repeatable and one agent is instantiated', () => {
  assert.deepEqual(createWorld('seeded', 123), createWorld('seeded', 123));
  assert.notDeepEqual(
    createWorld('seeded', 123).objects,
    createWorld('seeded', 124).objects,
  );
  assert.deepEqual(Object.keys(createWorld().agents), ['drone_001']);
});
test('sensors measure geometry without mutating world or prescribing an action', () => {
  const w = createWorld();
  w.objects = [
    {
      id: 'test',
      position: { x: 200, y: 360 },
      velocity: { x: 0, y: 0 },
      radius: 10,
      kind: 'ASTEROID',
      signal: false,
      activeAt: 0,
    },
  ];
  const before = structuredClone(w),
    o = observe(w, 'drone_001');
  assert.equal(o.detections[0].distance, 100);
  assert.equal(o.detections[0].relativeBearing, 0);
  assert.ok(o.detections[0].closestApproach < 0.001);
  assert.ok(
    Math.abs(o.detections[0].timeToClosestApproach! - 100 / 39) < 0.001,
  );
  assert.deepEqual(w, before);
  assert.equal('action' in o, false);
});
test('physics executes discrete actions and scanning updates observable classification', () => {
  const w = createWorld();
  w.time = 11;
  w.agents.drone_001.position = { x: 800, y: 360 };
  applyAction(w, 'drone_001', 'TURN_RIGHT');
  assert.ok(w.agents.drone_001.heading > 0);
  assert.equal(
    observe(w, 'drone_001').detections.find((d) => d.id === 'unknown_05')
      ?.classification,
    'UNKNOWN',
  );
  applyAction(w, 'drone_001', 'SCAN');
  assert.equal(
    observe(w, 'drone_001').detections.find((d) => d.id === 'unknown_05')
      ?.classification,
    'DEBRIS',
  );
});
test('hero policy encounters uncertainty, follows the mock plan and reaches destination', () => {
  const w = createWorld();
  const c = new Controller(
    new MockDecisionProvider(),
    new MockStrategyProvider(),
  );
  const s = c.state('drone_001');
  let uncertainty = false,
    planAt = Infinity;
  for (let i = 0; i < 500 && !w.agents.drone_001.complete; i++) {
    const o = observe(w, 'drone_001');
    if (w.time >= planAt)
      s.strategy = {
        ...s.strategy,
        mode: 'CAUTIOUS_BYPASS',
        safetyDistance: 85,
        scanRequired: true,
        revision: 1,
      };
    const d = chooseMockDecision({
      agentId: 'drone_001',
      observation: o,
      strategy: s.strategy,
      actions: ACTIONS,
      mission: 'Transit',
    });
    validateDecision(d);
    if (d.confidence < 0.7) {
      uncertainty = true;
      planAt = Math.min(planAt, w.time + 2.4);
    } else applyAction(w, 'drone_001', d.action);
    for (let f = 0; f < 18; f++) stepWorld(w, 1 / 60);
  }
  assert.ok(uncertainty);
  assert.ok(w.agents.drone_001.scanned.includes('unknown_05'));
  assert.ok(
    w.agents.drone_001.complete,
    JSON.stringify(w.agents.drone_001.position),
  );
  assert.equal(w.agents.drone_001.collisions.length, 0);
});
test('controller escalates on confidence and does not escalate clear observations', async () => {
  const w = createWorld(),
    c = new Controller(
      new MockDecisionProvider(0),
      new MockStrategyProvider(0),
    );
  c.tick(w);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(c.state('drone_001').telemetry[0].escalated, false);
  w.time = 12;
  w.agents.drone_001.position = { x: 720, y: 360 };
  c.tick(w);
  await new Promise((r) => setTimeout(r, 20));
  const s = c.state('drone_001');
  assert.equal(s.telemetry.at(-1)?.escalated, true);
  assert.equal(s.telemetry.at(-1)?.executed, false);
  assert.equal(s.strategy.revision, 1);
  c.dispose();
});
test('unconfigured Jev reports failure before any network request', async () => {
  const w = createWorld(),
    c = new Controller(new JevDecisionProvider(), new MockStrategyProvider(0));
  const context = {
    agentId: 'drone_001',
    observation: observe(w, 'drone_001'),
    strategy: c.state('drone_001').strategy,
    mission: 'Transit',
    actions: ACTIONS,
  };
  await assert.rejects(
    callJev(context, undefined, new AbortController().signal),
    /Jev unavailable/,
  );
  assert.equal(jevRequest(context).model, 'jev-latest');
  assert.equal(jevRequest(context).questions.action.type, 'choice');
  c.dispose();
});
test('invalid distributions are rejected', () => {
  assert.throws(
    () =>
      validateDecision({
        action: 'HOLD',
        confidence: 0.9,
        probabilities: Object.fromEntries(
          ACTIONS.map((a) => [a, 0.9]),
        ) as never,
      }),
    /Invalid/,
  );
});
test('Jev confidence is preserved separately from selected probability', () => {
  const probabilities = Object.fromEntries(
    ACTIONS.map((a) => [a, a === 'HOLD' ? 0.7 : 0.05]),
  );
  const decision = parseJevResponse({
    answers: {
      action: {
        type: 'choice',
        choice: 'HOLD',
        confidence: 0.43,
        probabilities,
      },
    },
  });
  assert.equal(decision.confidence, 0.43);
  assert.equal(decision.probabilities.HOLD, 0.7);
  assert.throws(() => parseJevResponse({ answers: {} }), /Invalid/);
});
test('disposing a controller ignores pending decisions', async () => {
  const w = createWorld(),
    c = new Controller(
      new MockDecisionProvider(20),
      new MockStrategyProvider(0),
    );
  c.tick(w);
  c.dispose();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(c.state('drone_001').telemetry.length, 0);
});
test('per-agent strategy and observation histories are isolated', async () => {
  const w = createWorld();
  w.agents.drone_002 = {
    ...structuredClone(w.agents.drone_001),
    id: 'drone_002',
    position: { x: 100, y: 100 },
  };
  const c = new Controller(
    new MockDecisionProvider(0),
    new MockStrategyProvider(0),
  );
  c.tick(w);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(c.state('drone_002').history[0].observerId, 'drone_002');
  assert.notEqual(c.state('drone_001').history, c.state('drone_002').history);
  c.dispose();
});
