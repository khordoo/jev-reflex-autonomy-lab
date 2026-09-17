import type { PlanningContext, Strategy } from './types';
import { validateStrategy } from './strategy-validation';
import { compactPlanningContext } from './planning-context';
export const DEFAULT_PLANNER_MODEL = 'z-ai/glm-5.3';
export const DEFAULT_PLANNER_FALLBACK_MODEL =
  'meta/muse-spark-1.3-contributor';
// Official request contract: https://openrouter.ai/docs/api_reference/overview
// and https://openrouter.ai/docs/guides/features/structured-outputs (2026-09-16).
export function planningRequest(context: PlanningContext, model: string) {
  const compactContext = compactPlanningContext(context);
  return {
    model,
    stream: false,
    max_tokens: 2000,
    reasoning: { effort: 'low' },
    provider: { require_parameters: true },
    messages: [
      {
        role: 'system',
        content:
          'Your guidance will be used for exactly one subsequent Jev decision, then discarded. Give guidance suitable for that next decision, not a multi-step scan-then-bypass sequence. ' +
          'You plan high-level strategy for a simulated autonomous drone. You do not steer individual frames or select immediate actions. Use only the supplied structured observations and recent decisions. Prioritize survival, then mission progress. If evidence is insufficient, choose a cautious bypass with a scan and adequate clearance. Do not claim to know what an unknown object is. Positive bearing is clockwise/right. Return the requested JSON strategy and a brief operational rationale; no additional prose. Avoid overriding measurement data with assumptions. ' +
          'Field constraints: safetyDistance must be a finite number between 0 and 300 metres inclusive (use clearance proportional to observed obstacles; otherwise keep it small, e.g. 20-90). rationale must be a non-empty string of at most 900 characters, describing the reasoning for this single next decision. mode must be one of TRANSIT or CAUTIOUS_BYPASS; preferredSide must be one of left or right; scanRequired must be a boolean.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          ...compactContext,
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
  if (typeof strategy.rationale === 'string' && strategy.rationale.length > 900)
    strategy.rationale = strategy.rationale.slice(0, 900);
  try {
    validateStrategy(strategy, context.agentId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[planner] rejected strategy output:', detail, {
      rawModelContent: choice.message.content,
      parsed,
    });
    throw new Error(`${detail} (model output: ${choice.message.content})`);
  }
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
  const request = (selectedModel: string) =>
    transport('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(planningRequest(context, selectedModel)),
      signal,
    });
  let response = await request(model);
  // Rate limits and server failures may be isolated to one model/provider.
  // Retry once on the independent fallback with the same bounded context.
  if (
    (response.status === 429 || response.status >= 500) &&
    model !== DEFAULT_PLANNER_FALLBACK_MODEL &&
    !signal.aborted
  )
    response = await request(DEFAULT_PLANNER_FALLBACK_MODEL);
  if (!response.ok) {
    if (response.status === 403 || response.status === 404) {
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
      if (
        typeof errorBody.error?.message === 'string' &&
        errorBody.error.message.includes('Paid model training violation')
      )
        throw new Error(
          'OpenRouter privacy settings exclude this Contributor model because it may use prompts and outputs for training. Review openrouter.ai/settings/privacy or choose another model.',
        );
    }
    if (response.status === 429 || response.status >= 500)
      throw new Error(
        `OpenRouter planners unavailable (HTTP ${response.status}). The primary and fallback models both failed or were rate-limited.`,
      );
    throw new Error(
      `OpenRouter service returned HTTP ${response.status}. Check model access, credits and configuration.`,
    );
  }
  return parsePlan(await response.json(), context);
}
