import type { PlanningEvent, TelemetryEvent } from './types';

export function confidenceSeries(
  events: TelemetryEvent[],
  failures: { simulationTime: number; agentId: string }[],
  agentId: string,
  planningEvents: PlanningEvent[] = [],
  now = Infinity,
) {
  const plans = planningEvents.filter((event) => event.agentId === agentId);
  const plannerActive = (time: number) =>
    plans.some(
      (event) => time >= event.startedAt && time <= (event.endedAt ?? now),
    );
  return [
    ...events
      .filter((e) => e.agentId === agentId)
      .map((e) => {
        const confidence = e.decision.confidence * 100;
        const planning = plannerActive(e.simulationTime);
        return {
          time: e.simulationTime,
          confidence,
          system1Confidence: planning ? null : confidence,
          planningConfidence: planning ? confidence : null,
          plannerActive: planning,
          threshold: e.threshold * 100,
          action: e.decision.action,
          provider: e.provider,
        };
      }),
    ...failures
      .filter((e) => e.agentId === agentId)
      .map((e) => ({
        time: e.simulationTime,
        confidence: null,
        system1Confidence: null,
        planningConfidence: null,
        plannerActive: plannerActive(e.simulationTime),
        threshold: null,
        action: 'PROVIDER ERROR',
        provider: '',
      })),
  ].sort((a, b) => a.time - b.time);
}

export function plannerSeries(
  events: PlanningEvent[],
  now: number,
  agentId: string,
) {
  const points = [{ time: 0, active: 0 }];
  for (const event of events
    .filter((e) => e.agentId === agentId)
    .sort((a, b) => a.startedAt - b.startedAt)) {
    points.push({ time: event.startedAt, active: 1 });
    if (event.endedAt !== undefined)
      points.push({ time: event.endedAt, active: 0 });
  }
  const last = points.at(-1)!;
  if (now > last.time) points.push({ time: now, active: last.active });
  return points;
}
