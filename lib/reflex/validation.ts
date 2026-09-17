import { ACTIONS, type Decision } from './types';
export function validateDecision(d: Decision) {
  const problems: string[] = [];
  if (!d) problems.push('decision is missing');
  else {
    if (!ACTIONS.includes(d.action)) problems.push(`action = ${JSON.stringify((d as { action?: unknown }).action)}`);
    if (!Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 1)
      problems.push(`confidence = ${JSON.stringify((d as { confidence?: unknown }).confidence)}`);
    if (!d.probabilities) problems.push('probabilities are missing');
    else
      ACTIONS.forEach((action) => {
        if (
          !Number.isFinite(d.probabilities[action]) ||
          d.probabilities[action] < 0 ||
          d.probabilities[action] > 1
        )
          problems.push(`probabilities[${action}] = ${JSON.stringify(d.probabilities[action])}`);
      });
    if (
      d.probabilities &&
      ACTIONS.every((action) => Number.isFinite(d.probabilities[action] as number))
    ) {
      const total = ACTIONS.reduce((n, action) => n + (d.probabilities[action] as number), 0);
      const tolerance = ACTIONS.length * 0.005;
      if (Math.abs(total - 1) > tolerance) problems.push(`probabilities sum = ${total.toFixed(4)}`);
    }
    if (
      d.apiLatencyMs !== undefined &&
      (!Number.isFinite(d.apiLatencyMs) || d.apiLatencyMs < 0)
    )
      problems.push(`apiLatencyMs = ${JSON.stringify(d.apiLatencyMs)}`);
  }
  if (problems.length) throw new Error(`Invalid decision distribution (${problems.join('; ')})`);
}
