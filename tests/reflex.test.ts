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
import { actionProjections } from '../lib/reflex/action-projection';
import type {
  Decision,
  DecisionProvider,
  PlanningContext,
  PlanningEvent,
  Strategy,
  TelemetryEvent,
} from '../lib/reflex/types';
import {
  confidenceSeries,
  latencySeries,
  plannerSeries,
} from '../lib/reflex/chart-data';
import {
  callPlanner,
  DEFAULT_PLANNER_FALLBACK_MODEL,
  parsePlan,
  planningRequest,
  DEFAULT_PLANNER_MODEL,
} from '../lib/reflex/openrouter-server';
import {
  compactPlanningContext,
  PLANNER_DECISION_WINDOW,
  PLANNER_OBSERVATION_WINDOW,
} from '../lib/reflex/planning-context';
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
test('physics projections omit ineffective actions without choosing a maneuver', () => {
  const w = createWorld();
  w.objects = [];
  w.agents.drone_001.velocity = { x: 0, y: 0 };
  const p = actionProjections(observe(w, 'drone_001'));
  assert.equal('DECELERATE' in p, false);
  assert.equal('SCAN' in p, false);
  assert.ok('TURN_LEFT' in p && 'TURN_RIGHT' in p);
  assert.equal(p.HOLD.destinationDistanceAfter2Seconds, 1388);
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
    Math.abs(o.detections[0].timeToClosestApproach! - 100 / 52) < 0.001,
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
    }
    applyAction(w, 'drone_001', d.action);
    for (let f = 0; f < 18; f++) stepWorld(w, 1 / 60);
  }
  assert.ok(uncertainty);
  assert.ok(w.agents.drone_001.scanned.includes('unknown_05'));
  assert.ok(
    w.agents.drone_001.complete,
    JSON.stringify(w.agents.drone_001.position),
  );
  assert.equal(
    w.agents.drone_001.collisions.length,
    0,
    JSON.stringify(w.agents.drone_001.collisions),
  );
});
function confidenceProvider(confidence: number): DecisionProvider {
  const remaining = (1 - confidence) / (ACTIONS.length - 1);
  return {
    name: 'confidence-test',
    mode: 'mock',
    async decide() {
      return {
        action: 'TURN_RIGHT',
        confidence,
        probabilities: Object.fromEntries(
          ACTIONS.map((action) => [
            action,
            action === 'TURN_RIGHT' ? confidence : remaining,
          ]),
        ) as Decision['probabilities'],
      };
    },
  };
}

async function tickOnce(c: Controller, w: ReturnType<typeof createWorld>) {
  c.tick(w);
  await new Promise((r) => setTimeout(r, 20));
  return c.state('drone_001').telemetry.at(-1);
}

test('system 2 activates below the 20% gate even with an empty scene', async () => {
  const w = createWorld();
  w.objects = [];
  const c = new Controller(
    confidenceProvider(0.19),
    new MockStrategyProvider(0),
  );
  const event = await tickOnce(c, w);
  assert.equal(event?.decision.confidence, 0.19);
  assert.equal(event?.escalated, true);
  assert.equal(event?.provisional, true);
  assert.equal(event?.executed, true);
  const state = c.state('drone_001');
  assert.equal(state.planningEvents.length, 1);
  assert.equal(state.planningEvents[0].trigger, 'confidence');
  assert.equal(state.planningEvents[0].triggerConfidence, 0.19);
  c.dispose();
});
test('system 2 stays off at the 20% gate and for high confidence next to a large unknown', async () => {
  const empty = createWorld();
  empty.objects = [];
  const boundary = new Controller(
    confidenceProvider(0.2),
    new MockStrategyProvider(0),
  );
  const boundaryEvent = await tickOnce(boundary, empty);
  assert.equal(boundaryEvent?.decision.confidence, 0.2);
  assert.equal(boundaryEvent?.escalated, false);
  assert.equal(boundaryEvent?.provisional, false);
  assert.equal(boundaryEvent?.executed, true);
  assert.equal(boundary.state('drone_001').planningEvents.length, 0);
  boundary.dispose();

  const w = createWorld();
  w.objects = [
    {
      id: 'large_unknown',
      position: { x: 800, y: 360 },
      velocity: { x: 0, y: 0 },
      radius: 60,
      kind: 'UNKNOWN',
      signal: false,
      activeAt: 0,
    },
  ];
  const confident = new Controller(
    confidenceProvider(0.9),
    new MockStrategyProvider(0),
  );
  const unknownEvent = await tickOnce(confident, w);
  assert.equal(unknownEvent?.decision.confidence, 0.9);
  assert.equal(unknownEvent?.escalated, false);
  assert.equal(unknownEvent?.provisional, false);
  assert.equal(unknownEvent?.executed, true);
  assert.equal(confident.state('drone_001').planningEvents.length, 0);
  confident.dispose();
});
test('a plan runs once while pending and its guidance is consumed by one decision', async () => {
  const w = createWorld();
  w.objects = [];
  let calls = 0;
  let finish!: (strategy: Strategy) => void;
  const planner = {
    name: 'pending-test',
    mode: 'mock' as const,
    plan: () => {
      calls++;
      return new Promise<Strategy>((resolve) => {
        finish = resolve;
      });
    },
  };
  const c = new Controller(confidenceProvider(0.1), planner);
  await tickOnce(c, w);
  const s = c.state('drone_001');
  assert.equal(calls, 1);
  assert.equal(s.planning, true);
  assert.equal(s.planningEvents[0].status, 'planning');

  w.time = 0.3;
  const during = await tickOnce(c, w);
  assert.equal(calls, 1);
  assert.equal(during?.guidanceRevision, undefined);
  assert.equal(s.planningEvents.length, 1);

  w.time = 0.6;
  finish({
    agentId: 'drone_001',
    mode: 'CAUTIOUS_BYPASS',
    preferredSide: 'right',
    safetyDistance: 60,
    scanRequired: false,
    rationale: 'One guidance consumption.',
    revision: 1,
  });
  await new Promise((r) => setTimeout(r, 0));
  const consumed = await tickOnce(c, w);
  assert.equal(consumed?.guidanceRevision, 1);
  assert.equal(s.guidancePending, false);
  assert.equal(s.strategy.mode, 'TRANSIT');
  c.dispose();
});
test('live decisions resume immediately after the prior response', async () => {
  let calls = 0;
  const provider = {
    name: 'live-test',
    mode: 'live' as const,
    async decide() {
      calls++;
      return {
        action: 'HOLD' as const,
        confidence: 0.9,
        probabilities: Object.fromEntries(
          ACTIONS.map((action) => [
            action,
            action === 'HOLD' ? 0.9 : 0.1 / (ACTIONS.length - 1),
          ]),
        ) as Record<(typeof ACTIONS)[number], number>,
      };
    },
  };
  const w = createWorld();
  const c = new Controller(provider, new MockStrategyProvider(0));
  c.tick(w);
  await new Promise((resolve) => setTimeout(resolve, 0));
  w.time = 0.3;
  c.tick(w);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 2);
  w.time = 0.5;
  c.tick(w);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 3);
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
test('Jev receives current measurements and durable strategy, never stale planner narration', () => {
  const context = planningFixture();
  context.strategy.rationale = 'Old bearing was -0.44; turn left';
  const request = jevRequest(context);
  assert.equal('rationale' in request.state.strategy, false);
  assert.deepEqual(request.state.observation, context.observation);
  assert.equal(
    request.state.strategy.preferredSide,
    context.strategy.preferredSide,
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

test('confidence chart uses returned confidence and leaves gaps for provider failures', async () => {
  const w = createWorld(),
    c = new Controller(
      new MockDecisionProvider(0),
      new MockStrategyProvider(0),
    );
  c.threshold = 0.8;
  c.tick(w);
  await new Promise((r) => setTimeout(r, 10));
  const event = c.state('drone_001').telemetry[0];
  const data = confidenceSeries(
    [event],
    [
      { agentId: 'drone_001', simulationTime: 2 },
      { agentId: 'drone_002', simulationTime: 1 },
    ],
    'drone_001',
  );
  assert.equal(data.length, 2);
  assert.equal(data[0].confidence, event.decision.confidence * 100);
  assert.equal(data[0].threshold, 80);
  assert.equal(data[1].confidence, null);
  assert.deepEqual(confidenceSeries([], [], 'drone_001'), []);
  c.dispose();
});
test('confidence chart changes color only while System 2 is actively planning', () => {
  const event = (time: number) =>
    ({
      simulationTime: time,
      agentId: 'drone_001',
      decision: { confidence: 0.5, action: 'HOLD' },
      threshold: 0.3,
      observation: { detections: [] },
      provider: 'jev',
    }) as unknown as import('../lib/reflex/types').TelemetryEvent;
  const plans = [
    {
      id: 'p1',
      agentId: 'drone_001',
      provider: 'planner',
      mode: 'live',
      startedAt: 2,
      endedAt: 4,
      status: 'completed',
      triggerConfidence: 0.2,
    },
  ] as PlanningEvent[];
  const data = confidenceSeries(
    [event(1), event(3), event(5)],
    [],
    'drone_001',
    plans,
    5,
  );
  assert.equal(data[0].system1Confidence, 50);
  assert.equal(data[0].planningConfidence, null);
  assert.equal(data[1].system1Confidence, null);
  assert.equal(data[1].planningConfidence, 50);
  assert.equal(data[2].system1Confidence, 50);
});
test('latency chart separates Jev milliseconds from planner wall time', () => {
  const event = {
    agentId: 'drone_001',
    simulationTime: 2,
    latencyMs: 157,
    provider: 'TypeSafe Jev',
  } as TelemetryEvent;
  const plan = {
    id: 'p1',
    agentId: 'drone_001',
    provider: 'Muse Spark',
    mode: 'live',
    startedAt: 3,
    endedAt: 6,
    latencyMs: 14900,
    status: 'completed',
    triggerConfidence: 0.2,
  } as PlanningEvent;
  const data = latencySeries([event], [plan], 'drone_001');
  assert.equal(data[0].system1LatencyMs, 157);
  assert.equal(data[0].system2LatencyMs, null);
  assert.equal(data[1].system1LatencyMs, null);
  assert.equal(data[1].system2LatencyMs, 14900);
  assert.deepEqual(latencySeries([], [], 'drone_001'), []);
});
test('a large-obstacle impact is terminal and cannot count as arrival', () => {
  const w = createWorld();
  const d = w.agents.drone_001;
  const obstacle = w.objects.find((o) => o.id === 'unknown_05')!;
  w.time = 10;
  d.position = { ...obstacle.position };
  d.velocity = { x: 65, y: 0 };
  w.destination = { ...obstacle.position };
  stepWorld(w, 0.01);
  assert.equal(d.health, 0);
  assert.equal(d.complete, false);
  assert.deepEqual(d.velocity, { x: 0, y: 0 });
});
test('planner chart shows exact request intervals including pending requests', () => {
  const plans: PlanningEvent[] = [
    {
      id: 'p1',
      agentId: 'drone_001',
      provider: 'mock',
      mode: 'mock',
      startedAt: 12,
      endedAt: 14.4,
      latencyMs: 2400,
      status: 'completed',
      triggerConfidence: 0.46,
      strategyRevision: 1,
    },
    {
      id: 'p2',
      agentId: 'drone_001',
      provider: 'mock',
      mode: 'mock',
      startedAt: 22,
      status: 'planning',
      triggerConfidence: 0.42,
    },
  ];
  assert.deepEqual(plannerSeries(plans, 24, 'drone_001'), [
    { time: 0, active: 0 },
    { time: 12, active: 1 },
    { time: 14.4, active: 0 },
    { time: 22, active: 1 },
    { time: 24, active: 1 },
  ]);
  assert.deepEqual(plannerSeries(plans, 24, 'drone_002'), [
    { time: 0, active: 0 },
    { time: 24, active: 0 },
  ]);
});
function planningFixture(): PlanningContext {
  const w = createWorld();
  w.time = 12;
  w.agents.drone_001.position = { x: 720, y: 360 };
  const c = new Controller(
    new MockDecisionProvider(),
    new MockStrategyProvider(),
  );
  const observation = observe(w, 'drone_001');
  return {
    agentId: 'drone_001',
    observation,
    strategy: c.state('drone_001').strategy,
    mission: 'Transit',
    actions: ACTIONS,
    observations: [observation],
    decisions: [],
  };
}
test('OpenRouter requests the selected model and strict strategy schema, preserving agent ownership', () => {
  const context = planningFixture();
  const request = planningRequest(context, DEFAULT_PLANNER_MODEL);
  assert.equal(request.model, 'meta/muse-spark-1.3-contributor');
  assert.equal(request.response_format.type, 'json_schema');
  assert.equal(request.provider.require_parameters, true);
  const content = {
    mode: 'CAUTIOUS_BYPASS',
    preferredSide: 'left',
    safetyDistance: 110,
    scanRequired: true,
    rationale: 'Gather evidence before resuming transit.',
  };
  const plan = parsePlan(
    {
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify(content) },
        },
      ],
    },
    context,
  );
  assert.equal(plan.agentId, context.agentId);
  assert.equal(plan.revision, 1);
  assert.equal(plan.preferredSide, 'left');
  assert.throws(
    () =>
      parsePlan(
        {
          choices: [
            {
              finish_reason: 'length',
              message: { content: JSON.stringify(content) },
            },
          ],
        },
        context,
      ),
    /complete strategy/,
  );
  assert.throws(
    () =>
      parsePlan(
        {
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({ ...content, safetyDistance: -1 }),
              },
            },
          ],
        },
        context,
      ),
    /Invalid planner/,
  );
  const clamped = parsePlan(
    {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({ ...content, rationale: 'x'.repeat(1201) }),
          },
        },
      ],
    },
    context,
  );
  assert.equal(clamped.rationale.length, 900);
});
test('System 2 context is bounded before transport and inside the model request', () => {
  const context = planningFixture();
  context.observations = Array.from({ length: 80 }, (_, index) => ({
    ...context.observation,
    time: index,
  }));
  context.decisions = Array.from({ length: 30 }, () => ({
    action: 'HOLD' as const,
    confidence: 1,
    probabilities: Object.fromEntries(
      ACTIONS.map((action) => [action, action === 'HOLD' ? 1 : 0]),
    ) as Record<(typeof ACTIONS)[number], number>,
  }));
  const compact = compactPlanningContext(context);
  assert.equal(compact.observations.length, PLANNER_OBSERVATION_WINDOW);
  assert.equal(compact.observations[0].time, 80 - PLANNER_OBSERVATION_WINDOW);
  assert.equal(compact.decisions.length, PLANNER_DECISION_WINDOW);
  assert.ok(JSON.stringify(compact).length < 200000);

  const request = planningRequest(context, DEFAULT_PLANNER_MODEL);
  const payload = JSON.parse(request.messages[1].content) as PlanningContext;
  assert.equal(payload.observations.length, PLANNER_OBSERVATION_WINDOW);
  assert.equal(payload.decisions.length, PLANNER_DECISION_WINDOW);
});
test('OpenRouter missing key and HTTP failures never substitute a mock strategy', async () => {
  const context = planningFixture(),
    signal = new AbortController().signal;
  await assert.rejects(
    callPlanner(context, undefined, DEFAULT_PLANNER_MODEL, signal),
    /OPENROUTER_API_KEY/,
  );
  await assert.rejects(
    callPlanner(
      context,
      'test-key',
      DEFAULT_PLANNER_MODEL,
      signal,
      async () => new Response('{}', { status: 429 }),
    ),
    /HTTP 429/,
  );
});
for (const recoverableStatus of [429, 500, 503, 529])
  test(`OpenRouter retries HTTP ${recoverableStatus} once with GLM 5.3`, async () => {
    const context = planningFixture();
    const models: string[] = [];
    const content = {
      mode: 'CAUTIOUS_BYPASS',
      preferredSide: 'right',
      safetyDistance: 90,
      scanRequired: true,
      rationale: 'Maintain clearance while collecting evidence.',
    };
    const plan = await callPlanner(
      context,
      'test-key',
      DEFAULT_PLANNER_MODEL,
      new AbortController().signal,
      async (_url, init) => {
        const body = init?.body as string;
        models.push(JSON.parse(body).model);
        if (models.length === 1)
          return new Response('{}', { status: recoverableStatus });
        return Response.json({
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify(content) },
            },
          ],
        });
      },
    );
    assert.deepEqual(models, [
      DEFAULT_PLANNER_MODEL,
      DEFAULT_PLANNER_FALLBACK_MODEL,
    ]);
    assert.equal(plan.revision, 1);
  });
test('controller records planner start and completion at actual simulation times', async () => {
  const w = createWorld();
  w.time = 12;
  w.agents.drone_001.position = { x: 720, y: 360 };
  let finish!: (value: Strategy) => void;
  const planner = {
    name: 'controlled',
    mode: 'mock' as const,
    plan: () =>
      new Promise<Strategy>((resolve) => {
        finish = resolve;
      }),
  };
  const c = new Controller(confidenceProvider(0.19), planner);
  c.tick(w);
  await new Promise((r) => setTimeout(r, 10));
  const s = c.state('drone_001');
  assert.equal(s.planningEvents[0].startedAt, 12);
  assert.equal(s.planningEvents[0].status, 'planning');
  w.time = 15;
  finish({ ...s.strategy, mode: 'CAUTIOUS_BYPASS', revision: 1 });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(s.planningEvents[0].endedAt, 15);
  assert.equal(s.planningEvents[0].status, 'completed');
  assert.equal(s.planningEvents[0].strategyRevision, 1);
  assert.equal(s.planning, false);
  c.dispose();
});
test('planner failures are recorded in the failures list', async () => {
  const w = createWorld();
  const planner = {
    name: 'controlled',
    mode: 'mock' as const,
    plan: () =>
      Promise.reject(
        new Error('Invalid planner strategy (rationale length 1201 exceeds 900)'),
      ),
  };
  const c = new Controller(confidenceProvider(0.19), planner);
  c.tick(w);
  await new Promise((r) => setTimeout(r, 10));
  const s = c.state('drone_001');
  assert.equal(s.planningEvents[0].status, 'failed');
  assert.equal(c.failures.length, 1);
  assert.equal(c.failures[0].provider, 'controlled');
  assert.match(c.failures[0].message, /rationale length 1201 exceeds 900/);
  c.dispose();
});
