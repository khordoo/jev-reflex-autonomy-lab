import { mkdirSync, writeFileSync } from 'node:fs';
import { Controller } from '../lib/reflex/controller';
import { JevDecisionProvider, OpenRouterStrategyProvider } from '../lib/reflex/providers';
import { createWorld, stepWorld } from '../lib/reflex/world';

// Explicitly invoked, bounded real-provider mission. Uses server-held keys only.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => originalFetch(typeof input === 'string' && input.startsWith('/api/') ? `http://localhost:3000${input}` : input, init);
const config = await fetch('/api/providers').then(r => r.json()) as { jevConfigured: boolean; plannerConfigured: boolean; plannerModel: string };
if (!config.jevConfigured || !config.plannerConfigured) throw new Error('Both live providers must be configured');
const world = createWorld();
const controller = new Controller(new JevDecisionProvider(), new OpenRouterStrategyProvider(config.plannerModel));
const state = controller.state('drone_001');
const started = performance.now(); let previous = started, accumulator = 0, lastReport = 0;
await new Promise<void>(resolve => {
  const timer = setInterval(() => {
    const now = performance.now(); accumulator += Math.min((now - previous) / 1000, .1); previous = now;
    while (accumulator >= 1 / 60) { stepWorld(world, 1 / 60); accumulator -= 1 / 60; }
    controller.tick(world);
    if (world.time - lastReport >= 8) { lastReport = world.time; console.log(JSON.stringify({ time: +world.time.toFixed(1), decisions: state.telemetry.length, confidence: state.decision?.confidence, action: state.decision?.action, planning: state.planning, strategyRevision: state.strategy.revision, health: world.agents.drone_001.health, error: state.error || state.plannerError })); }
    if (world.time >= 45 || world.agents.drone_001.complete || world.agents.drone_001.health <= 0 || state.plannerError) { clearInterval(timer); resolve(); }
  }, 16);
});
const drainStarted = performance.now();
while ((state.decisionPending || state.planning) && performance.now() - drainStarted < 31000) await new Promise(r => setTimeout(r, 30));
controller.dispose();
const sortedLatencies = state.telemetry.map(e => e.latencyMs).sort((a, b) => a - b);
const summary = { time: +world.time.toFixed(2), decisions: state.telemetry.length, confidenceMin: Math.min(...state.telemetry.map(e => e.decision.confidence)), confidenceMax: Math.max(...state.telemetry.map(e => e.decision.confidence)), medianApiMs: sortedLatencies[Math.floor(sortedLatencies.length / 2)], completedPlans: state.planningEvents.filter(e => e.status === 'completed').length, failedPlans: state.planningEvents.filter(e => e.status === 'failed').length, providerFailures: controller.failures.length, health: world.agents.drone_001.health, missionComplete: world.agents.drone_001.complete, collisions: world.agents.drone_001.collisions.length };
mkdirSync('outputs', { recursive: true });
writeFileSync('outputs/live-mission.json', JSON.stringify({ summary, world, events: state.telemetry, planningEvents: state.planningEvents, failures: controller.failures }, null, 2));
console.log('LIVE MISSION SUMMARY', JSON.stringify(summary));
if (controller.failures.length || state.plannerError) process.exitCode = 1;
