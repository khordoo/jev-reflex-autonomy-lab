import {
  ACTIONS,
  type AgentControl,
  type DecisionProvider,
  type StrategyProvider,
  type TelemetryEvent,
  type World,
} from './types';
import { observe } from './sensors';
import { applyAction, outcome } from './world';
import { validateDecision } from './validation';
export { validateDecision } from './validation';
export class Controller {
  agents: Record<string, AgentControl> = {};
  threshold = 0.7;
  failures: {
    timestamp: string;
    agentId: string;
    simulationTime: number;
    provider: string;
    message: string;
  }[] = [];
  private requests = new Set<AbortController>();
  private disposed = false;
  private generation = 0;
  private failuresByAgent: Record<string, number> = {};
  constructor(
    public decisionProvider: DecisionProvider,
    public planner: StrategyProvider,
  ) {}
  activate() {
    this.disposed = false;
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    for (const r of this.requests) r.abort();
    this.requests.clear();
  }
  state(id: string) {
    return (this.agents[id] ??= {
      strategy: {
        agentId: id,
        mode: 'TRANSIT',
        preferredSide: 'right',
        safetyDistance: 45,
        scanRequired: false,
        rationale: 'Reach the destination while preserving the drone.',
        revision: 0,
      },
      latencyMs: 0,
      planning: false,
      decisionPending: false,
      lastDecisionAt: -1,
      lastPlanAt: -100,
      history: [],
      telemetry: [],
    });
  }
  tick(world: World) {
    for (const id of Object.keys(world.agents)) {
      const s = this.state(id),
        d = world.agents[id];
      s.observation = observe(world, id);
      if (
        !s.decisionPending &&
        world.time - s.lastDecisionAt >= 0.28 &&
        !d.complete &&
        d.health > 0 &&
        d.battery > 0
      )
        void this.decide(world, id);
    }
  }
  private async bounded<T>(
    work: (signal: AbortSignal) => Promise<T>,
    ms: number,
  ): Promise<T> {
    const r = new AbortController();
    this.requests.add(r);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work(r.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            r.abort();
            reject(new Error('Provider timeout'));
          }, ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      this.requests.delete(r);
    }
  }
  private async decide(world: World, id: string) {
    const generation = this.generation;
    const s = this.state(id);
    s.decisionPending = true;
    s.lastDecisionAt = world.time;
    const observation = observe(world, id),
      strategy = { ...s.strategy },
      start = performance.now();
    const context = {
      agentId: id,
      observation,
      strategy,
      mission: 'Reach destination while preserving the drone.',
      actions: ACTIONS,
    };
    try {
      const decision = await this.bounded(
        (signal) => this.decisionProvider.decide(context, signal),
        2000,
      );
      if (this.disposed || generation !== this.generation) return;
      validateDecision(decision);
      s.error = undefined;
      this.failuresByAgent[id] = 0;
      s.decision = decision;
      s.latencyMs = decision.apiLatencyMs ?? performance.now() - start;
      s.history.push(observation);
      if (s.history.length > 80) s.history.shift();
      const executed = decision.confidence >= this.threshold;
      if (executed) applyAction(world, id, decision.action);
      const escalated =
        !executed && !s.planning && world.time - s.lastPlanAt >= 6;
      const event: TelemetryEvent = {
        timestamp: new Date().toISOString(),
        simulationTime: world.time,
        agentId: id,
        observation,
        decision,
        latencyMs: s.latencyMs,
        provider: this.decisionProvider.name,
        executed,
        escalated,
        strategyBefore: strategy,
        strategyAfter: { ...s.strategy },
        outcome: outcome(world.agents[id]),
      };
      s.telemetry.push(event);
      if (s.telemetry.length > 1500) s.telemetry.shift();
      if (escalated) {
        s.planning = true;
        s.lastPlanAt = world.time;
        const planStart = performance.now();
        void this.bounded(
          (signal) =>
            this.planner.plan(
              {
                ...context,
                observations: [...s.history],
                decisions: s.telemetry.slice(-30).map((e) => e.decision),
              },
              signal,
            ),
          12000,
        )
          .then((plan) => {
            if (this.disposed || generation !== this.generation) return;
            if (
              plan.agentId !== id ||
              !['TRANSIT', 'CAUTIOUS_BYPASS'].includes(plan.mode) ||
              !['left', 'right'].includes(plan.preferredSide) ||
              !Number.isFinite(plan.safetyDistance) ||
              plan.safetyDistance < 0 ||
              plan.safetyDistance > 300 ||
              typeof plan.scanRequired !== 'boolean' ||
              typeof plan.rationale !== 'string'
            )
              throw new Error('Invalid planner strategy');
            s.strategy = plan;
            event.strategyAfter = { ...plan };
            event.system2LatencyMs = performance.now() - planStart;
          })
          .catch((error) => {
            if (!this.disposed) {
              s.error = String(error.message);
              event.error = s.error;
            }
          })
          .finally(() => {
            s.planning = false;
          });
      }
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        s.error = error instanceof Error ? error.message : 'Provider failed';
        this.failuresByAgent[id] = (this.failuresByAgent[id] || 0) + 1;
        s.lastDecisionAt =
          world.time + Math.min(30, 2 ** this.failuresByAgent[id]);
        this.failures.push({
          timestamp: new Date().toISOString(),
          agentId: id,
          simulationTime: world.time,
          provider: this.decisionProvider.name,
          message: s.error,
        });
        if (this.failures.length > 200) this.failures.shift();
      }
    } finally {
      s.decisionPending = false;
    }
  }
}
