import type { PlanningContext, Strategy } from './types';
import { validateStrategy } from './strategy-validation';
export const DEFAULT_PLANNER_MODEL = 'meta/muse-spark-1.3-contributor';
// Official request contract: https://openrouter.ai/docs/api_reference/overview
// and https://openrouter.ai/docs/guides/features/structured-outputs (2026-09-16).
export function planningRequest(context: PlanningContext, model: string) {
  return {
    model,
    stream: false,
    max_tokens: 2000,
    provider: { require_parameters: true },
    messages: [
      {
        role: 'system',
        content:
          'You plan high-level strategy for a simulated autonomous drone. You do not steer individual frames or select immediate actions. Use only the supplied structured observations and recent decisions. Prioritize survival, then mission progress. If evidence is insufficient, choose a cautious bypass with a scan and adequate clearance. Do not claim to know what an unknown object is. Positive bearing is clockwise/right. Return the requested JSON strategy and a brief operational rationale; no additional prose. Avoid overriding measurement data with assumptions.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          ...context,
          observations: context.observations.slice(-30),
          decisions: context.decisions.slice(-20),
          units: 'metres, seconds, radians',
        }),
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'drone_strategy',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            mode: { type: 'string', enum: ['TRANSIT', 'CAUTIOUS_BYPASS'] },
            preferredSide: { type: 'string', enum: ['left', 'right'] },
            safetyDistance: { type: 'number' },
            scanRequired: { type: 'boolean' },
            rationale: { type: 'string' },
          },
          required: [
            'mode',
            'preferredSide',
            'safetyDistance',
            'scanRequired',
            'rationale',
          ],
        },
      },
    },
  };
}
export function parsePlan(body: unknown, context: PlanningContext): Strategy {
  const response = body as {
    error?: unknown;
    choices?: { finish_reason?: string; message?: { content?: unknown } }[];
  };
  const choice = response?.choices?.[0];
  if (
    response?.error ||
    !choice ||
    choice.finish_reason !== 'stop' ||
    typeof choice.message?.content !== 'string'
  )
    throw new Error('OpenRouter returned no complete strategy');
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(choice.message.content);
  } catch {
    throw new Error('OpenRouter returned invalid strategy JSON');
  }
  if (
    !parsed ||
    Array.isArray(parsed) ||
    typeof parsed !== 'object' ||
    Object.keys(parsed).some(
      (k) =>
        ![
          'mode',
          'preferredSide',
          'safetyDistance',
          'scanRequired',
          'rationale',
        ].includes(k),
    )
  )
    throw new Error('OpenRouter returned unexpected strategy fields');
  const strategy = {
    ...parsed,
    agentId: context.agentId,
    revision: context.strategy.revision + 1,
  } as Strategy;
  validateStrategy(strategy, context.agentId);
  return strategy;
}
export async function callPlanner(
  context: PlanningContext,
  key: string | undefined,
  model: string,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<Strategy> {
  if (!key)
    throw new Error(
      'OpenRouter unavailable: set OPENROUTER_API_KEY in the server environment. No mock fallback.',
    );
  if (!model || model.length > 150 || !/^[\w./:-]+$/.test(model))
    throw new Error('OpenRouter model configuration is invalid');
  const response = await transport(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(planningRequest(context, model)),
      signal,
    },
  );
  if (!response.ok) {
    if (response.status === 403) {
      const errorBody = (await response.json().catch(() => ({}))) as {
        error?: { message?: unknown };
      };
      if (
        typeof errorBody.error?.message === 'string' &&
        errorBody.error.message.includes('18+ age confirmation')
      )
        throw new Error(
          'OpenRouter requires 18+ age confirmation for this model. Complete it at openrouter.ai/settings/preferences, then retry.',
        );
    }
    throw new Error(
      `OpenRouter service returned HTTP ${response.status}. Check model access, credits and configuration.`,
    );
  }
  return parsePlan(await response.json(), context);
}
