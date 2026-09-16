import { ACTIONS, type Decision } from './types';
export function validateDecision(d: Decision) {
  if (
    !d ||
    !ACTIONS.includes(d.action) ||
    !Number.isFinite(d.confidence) ||
    d.confidence < 0 ||
    d.confidence > 1 ||
    !d.probabilities ||
    ACTIONS.some(
      (a) =>
        !Number.isFinite(d.probabilities[a]) ||
        d.probabilities[a] < 0 ||
        d.probabilities[a] > 1,
    ) ||
    Math.abs(ACTIONS.reduce((n, a) => n + d.probabilities[a], 0) - 1) > 0.01 ||
    (d.apiLatencyMs !== undefined &&
      (!Number.isFinite(d.apiLatencyMs) || d.apiLatencyMs < 0))
  )
    throw new Error('Invalid decision distribution');
}
