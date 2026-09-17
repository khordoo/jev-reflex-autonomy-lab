import type { Strategy } from './types';
export function validateStrategy(plan: Strategy, agentId: string) {
  if (
    !plan ||
    plan.agentId !== agentId ||
    !['TRANSIT', 'CAUTIOUS_BYPASS'].includes(plan.mode) ||
    !['left', 'right'].includes(plan.preferredSide) ||
    !Number.isFinite(plan.safetyDistance) ||
    plan.safetyDistance < 0 ||
    plan.safetyDistance > 300 ||
    typeof plan.scanRequired !== 'boolean' ||
    typeof plan.rationale !== 'string' ||
    !plan.rationale.trim() ||
    plan.rationale.length > 600 ||
    !Number.isInteger(plan.revision) ||
    plan.revision < 0
  )
    throw new Error('Invalid planner strategy');
}
