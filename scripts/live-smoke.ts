import { createWorld } from '../lib/reflex/world';
import { observe } from '../lib/reflex/sensors';
import { ACTIONS } from '../lib/reflex/types';
import type { Decision, Strategy } from '../lib/reflex/types';
import { validateDecision } from '../lib/reflex/validation';
import { validateStrategy } from '../lib/reflex/strategy-validation';

// Explicitly invoked integration smoke test: at most one request per service.
const origin = 'http://localhost:3000';
const config = (await fetch(`${origin}/api/providers`).then((r) =>
  r.json(),
)) as {
  jevConfigured: boolean;
  plannerConfigured: boolean;
  plannerModel: string;
};
console.log('Configuration:', JSON.stringify(config));
if (!config.jevConfigured || !config.plannerConfigured)
  throw new Error('Both provider keys must be loaded by the local server.');
const world = createWorld();
world.time = 12;
world.agents.drone_001.position = { x: 720, y: 360 };
const strategy: Strategy = {
  agentId: 'drone_001',
  mode: 'TRANSIT',
  preferredSide: 'right',
  safetyDistance: 45,
  scanRequired: false,
  rationale: 'Reach the destination while preserving the drone.',
  revision: 0,
};
const context = {
  agentId: 'drone_001',
  mission: 'Reach destination while preserving the drone.',
  actions: ACTIONS,
  strategy,
  observation: observe(world, 'drone_001'),
};
const started = performance.now();
const response = await fetch(`${origin}/api/decision`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(context),
  signal: AbortSignal.timeout(10000),
});
const result = (await response.json()) as Decision & { error?: string };
if (!response.ok)
  throw new Error(result.error || `Jev HTTP ${response.status}`);
validateDecision(result);
console.log(
  'Jev:',
  JSON.stringify({
    action: result.action,
    confidence: result.confidence,
    selectedProbability: result.probabilities[result.action],
    apiLatencyMs: result.apiLatencyMs,
    roundTripMs: Math.round(performance.now() - started),
  }),
);
const planStarted = performance.now();
const planResponse = await fetch(`${origin}/api/strategy`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ...context,
    observations: [context.observation],
    decisions: [result],
  }),
  signal: AbortSignal.timeout(35000),
});
const plan = (await planResponse.json()) as Strategy & { error?: string };
if (!planResponse.ok)
  throw new Error(plan.error || `Planner HTTP ${planResponse.status}`);
validateStrategy(plan, 'drone_001');
console.log(
  'System 2:',
  JSON.stringify({
    model: config.plannerModel,
    roundTripMs: Math.round(performance.now() - planStarted),
    strategy: plan,
  }),
);
