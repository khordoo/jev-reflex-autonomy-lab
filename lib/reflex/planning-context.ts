import type { PlanningContext } from './types';

export const PLANNER_OBSERVATION_WINDOW = 12;
export const PLANNER_DECISION_WINDOW = 12;

/** Keep System 2 focused on recent evidence and bound the browser request size. */
export function compactPlanningContext(
  context: PlanningContext,
): PlanningContext {
  return {
    ...context,
    observations: context.observations.slice(-PLANNER_OBSERVATION_WINDOW),
    decisions: context.decisions.slice(-PLANNER_DECISION_WINDOW),
  };
}
