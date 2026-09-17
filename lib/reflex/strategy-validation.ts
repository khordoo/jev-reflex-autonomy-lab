import type { Strategy } from './types';
export function validateStrategy(plan: Strategy, agentId: string) {
  const problems: string[] = [];
  if (!plan) problems.push(`plan is ${String(plan)}`);
  else {
    if (plan.agentId !== agentId)
      problems.push(
        `agentId ${JSON.stringify(plan.agentId)} does not match ${JSON.stringify(agentId)}`,
      );
    if (!['TRANSIT', 'CAUTIOUS_BYPASS'].includes(plan.mode))
      problems.push(`mode = ${JSON.stringify(plan.mode)}`);
    if (!['left', 'right'].includes(plan.preferredSide))
      problems.push(`preferredSide = ${JSON.stringify(plan.preferredSide)}`);
    if (
      !Number.isFinite(plan.safetyDistance) ||
      plan.safetyDistance < 0 ||
      plan.safetyDistance > 300
    )
      problems.push(`safetyDistance = ${JSON.stringify(plan.safetyDistance)}`);
    if (typeof plan.scanRequired !== 'boolean')
      problems.push(`scanRequired = ${JSON.stringify(plan.scanRequired)}`);
    if (typeof plan.rationale !== 'string')
      problems.push(`rationale is not a string`);
    else if (!plan.rationale.trim()) problems.push('rationale is empty');
    else if (plan.rationale.length > 600)
      problems.push(`rationale length ${plan.rationale.length} exceeds 600`);
    if (!Number.isInteger(plan.revision) || plan.revision < 0)
      problems.push(`revision = ${JSON.stringify(plan.revision)}`);
  }
  if (problems.length) throw new Error(`Invalid planner strategy (${problems.join('; ')})`);
}
