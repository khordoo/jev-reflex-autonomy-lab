import {
  ACTIONS,
  type Action,
  type Decision,
  type DecisionContext,
  type DecisionProvider,
  type PlanningContext,
  type StrategyProvider,
} from './types';
import { validateDecision } from './validation';
import { validateStrategy } from './strategy-validation';
import { actionProjections } from './action-projection';
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Cancelled'));
    const abort = () => {
      clearTimeout(timer);
      reject(new Error('Cancelled'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export class MockDecisionProvider implements DecisionProvider {
  name = 'Development mock';
  mode = 'mock' as const;
  constructor(private delayMs = 85) {}
  async decide(context: DecisionContext, signal: AbortSignal) {
    await delay(this.delayMs, signal);
    return chooseMockDecision(context);
  }
}
export function chooseMockDecision({
  observation: o,
  strategy: s,
}: DecisionContext) {
  let action: Action = 'HOLD',
    confidence = 0.96;
  const projections = actionProjections(o);
  const clearance = (a: string) =>
    Math.min(
      projections[a].boundaryClearanceMetres,
      ...projections[a].contacts.map((c) => c.surfaceClearanceMetres),
      340,
    );
  const mockTurn: Action =
    clearance('TURN_LEFT') > clearance('TURN_RIGHT')
      ? 'TURN_LEFT'
      : 'TURN_RIGHT';
  const unknown = o.detections.find(
    (d) => d.classification === 'UNKNOWN' && Math.abs(d.relativeBearing) < 1.5,
  );
  const threat = o.detections.find(
    (d) =>
      Math.abs(d.relativeBearing) < 1.45 &&
      d.timeToClosestApproach !== null &&
      d.timeToClosestApproach < 7 &&
      d.closestApproach < d.estimatedSize + s.safetyDistance,
  );
  if (unknown && s.mode === 'TRANSIT') {
    action = threat ? mockTurn : 'DECELERATE';
    confidence = 0.46;
  } else if (unknown && s.scanRequired) action = 'SCAN';
  else if (threat) action = mockTurn;
  else if (Math.abs(o.destinationBearing) > 0.13)
    action = o.destinationBearing > 0 ? 'TURN_RIGHT' : 'TURN_LEFT';
  else if (o.speed < (s.mode === 'CAUTIOUS_BYPASS' ? 38 : 53))
    action = 'ACCELERATE';
  const probabilities = Object.fromEntries(
    ACTIONS.map((a) => [
      a,
      a === action ? confidence : (1 - confidence) / (ACTIONS.length - 1),
    ]),
  ) as Record<Action, number>;
  return { action, confidence, probabilities };
}
export class MockStrategyProvider implements StrategyProvider {
  name = 'Development planner';
  mode = 'mock' as const;
  constructor(private delayMs = 2400) {}
  async plan(c: PlanningContext, signal: AbortSignal) {
    await delay(this.delayMs, signal);
    return {
      agentId: c.agentId,
      mode: 'CAUTIOUS_BYPASS' as const,
      preferredSide: 'right' as const,
      safetyDistance: 85,
      scanRequired: true,
      rationale:
        'Unknown signal source on route. Scan to collect evidence, bypass right with 85 m clearance, then resume destination.',
      revision: c.strategy.revision + 1,
    };
  }
}
/** Browser proxy; the documented vendor mapping and secret stay on the server. */
export class JevDecisionProvider implements DecisionProvider {
  name = 'TypeSafe Jev';
  mode = 'live' as const;
  async decide(context: DecisionContext, signal: AbortSignal) {
    const response = await fetch('/api/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
      signal,
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(
        (body as { error?: string })?.error || 'Jev request failed',
      );
    validateDecision(body as Decision);
    return body as Decision;
  }
}
export class OpenRouterStrategyProvider implements StrategyProvider {
  name: string;
  mode = 'live' as const;
  constructor(model = 'meta/muse-spark-1.3-contributor') {
    this.name = model;
  }
  async plan(context: PlanningContext, signal: AbortSignal) {
    const response = await fetch('/api/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
      signal,
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(
        (body as { error?: string })?.error || 'OpenRouter request failed',
      );
    const strategy = body as import('./types').Strategy;
    validateStrategy(strategy, context.agentId);
    return strategy;
  }
}
