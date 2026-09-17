import { createWorld, applyAction, stepWorld } from '../lib/reflex/world';
import { observe } from '../lib/reflex/sensors';
import { ACTIONS } from '../lib/reflex/types';
import type { Decision, Strategy } from '../lib/reflex/types';
import { validateDecision } from '../lib/reflex/validation';

// Burst-latency test: 15 sequential Jev calls simulating a live mission cadence.
// Measures actual API latency, round-trip time, and catches timeouts/errors.

const CALLS = 15;
const TIMEOUT_MS = 5000; // match the controller's outer timeout
const origin = 'http://localhost:3000';

// Verify server is running and keys are configured
const config = (await fetch(`${origin}/api/providers`).then((r) =>
  r.json(),
)) as { jevConfigured: boolean; plannerConfigured: boolean };
if (!config.jevConfigured)
  throw new Error('TYPESAFE_API_KEY not configured on server. Start the dev server with the key set.');

const strategy: Strategy = {
  agentId: 'drone_001',
  mode: 'TRANSIT',
  preferredSide: 'right',
  safetyDistance: 45,
  scanRequired: false,
  rationale: 'Reach the destination while preserving the drone.',
  revision: 0,
};

const world = createWorld();
world.time = 5; // Start mid-scenario so some objects are active

const results: {
  call: number;
  action: string;
  confidence: number;
  apiLatencyMs: number;
  roundTripMs: number;
  status: 'ok' | 'timeout' | 'error';
  error?: string;
}[] = [];

console.log(`\n🚀 Jev burst-latency test: ${CALLS} sequential calls\n`);
console.log('call | action       | conf  | API ms | RT ms  | status');
console.log('-----|--------------|-------|--------|--------|-------');

for (let i = 0; i < CALLS; i++) {
  // Advance world a bit each call to vary the observation
  stepWorld(world, 0.5);
  const observation = observe(world, 'drone_001');

  const context = {
    agentId: 'drone_001',
    mission: 'Reach destination while preserving the drone.',
    actions: ACTIONS,
    strategy,
    observation,
  };

  const start = performance.now();
  try {
    const response = await fetch(`${origin}/api/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const rt = Math.round(performance.now() - start);

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      const errorMsg = (body as { error?: string }).error || `HTTP ${response.status}`;
      results.push({ call: i + 1, action: '-', confidence: 0, apiLatencyMs: 0, roundTripMs: rt, status: 'error', error: errorMsg });
      console.log(`${String(i + 1).padStart(4)} | ${'ERROR'.padEnd(12)} |       | ${String(rt).padStart(6)} |        | ${errorMsg}`);
      continue;
    }

    const result = (await response.json()) as Decision & { apiLatencyMs?: number; error?: string };
    validateDecision(result);
    const apiMs = Math.round(result.apiLatencyMs ?? 0);
    results.push({ call: i + 1, action: result.action, confidence: result.confidence, apiLatencyMs: apiMs, roundTripMs: rt, status: 'ok' });
    console.log(
      `${String(i + 1).padStart(4)} | ${result.action.padEnd(12)} | ${result.confidence.toFixed(2).padStart(5)} | ${String(apiMs).padStart(6)} | ${String(rt).padStart(6)} | ok`,
    );

    // Apply the action so the next observation is different
    applyAction(world, 'drone_001', result.action);
  } catch (err) {
    const rt = Math.round(performance.now() - start);
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes('timeout') || msg.includes('abort') || msg.includes('Timeout');
    results.push({ call: i + 1, action: '-', confidence: 0, apiLatencyMs: 0, roundTripMs: rt, status: isTimeout ? 'timeout' : 'error', error: msg });
    console.log(`${String(i + 1).padStart(4)} | ${'FAIL'.padEnd(12)} |       | ${String(rt).padStart(6)} |        | ${isTimeout ? 'TIMEOUT' : msg}`);
  }
}

// Summary
const ok = results.filter((r) => r.status === 'ok');
const timeouts = results.filter((r) => r.status === 'timeout');
const errors = results.filter((r) => r.status === 'error');
const apiTimes = ok.map((r) => r.apiLatencyMs).sort((a, b) => a - b);
const rtTimes = ok.map((r) => r.roundTripMs).sort((a, b) => a - b);

console.log('\n━━━ Summary ━━━');
console.log(`Successful: ${ok.length}/${CALLS}`);
console.log(`Timeouts:   ${timeouts.length}/${CALLS}`);
console.log(`Errors:     ${errors.length}/${CALLS}`);
if (ok.length > 0) {
  const median = (arr: number[]) => arr.length % 2 ? arr[Math.floor(arr.length / 2)] : Math.round((arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2);
  console.log(`\nAPI latency  — min: ${apiTimes[0]}ms, median: ${median(apiTimes)}ms, max: ${apiTimes.at(-1)}ms`);
  console.log(`Round-trip   — min: ${rtTimes[0]}ms, median: ${median(rtTimes)}ms, max: ${rtTimes.at(-1)}ms`);
  console.log(`\nAvg API:  ${Math.round(apiTimes.reduce((a, b) => a + b, 0) / ok.length)}ms`);
  console.log(`Avg RT:   ${Math.round(rtTimes.reduce((a, b) => a + b, 0) / ok.length)}ms`);
}
if (errors.length > 0) {
  console.log('\nError details:');
  for (const e of errors) console.log(`  Call ${e.call}: ${e.error}`);
}
if (timeouts.length > 0) {
  console.log('\nTimeout details:');
  for (const t of timeouts) console.log(`  Call ${t.call}: ${t.roundTripMs}ms (limit: ${TIMEOUT_MS}ms)`);
}
console.log('');
