import { callPlanner } from '@/lib/reflex/openrouter-server';
import type { PlanningContext } from '@/lib/reflex/types';
import {
  credentialsForRequest,
  providerConfiguration,
  readSavedCredentials,
  sameOriginRequest,
} from '@/lib/reflex/credential-cookie';
export async function POST(request: Request) {
  if (!sameOriginRequest(request))
    return Response.json(
      { error: 'Cross-origin requests are not supported' },
      { status: 403 },
    );
  try {
    const text = await request.text();
    if (text.length > 200000)
      return Response.json(
        { error: 'Planning context too large' },
        { status: 413 },
      );
    let context: PlanningContext;
    try {
      context = JSON.parse(text);
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    if (
      !context ||
      typeof context.agentId !== 'string' ||
      context.agentId.length > 80 ||
      typeof context.mission !== 'string' ||
      !context.observation ||
      context.observation.observerId !== context.agentId ||
      !context.strategy ||
      context.strategy.agentId !== context.agentId ||
      !Number.isInteger(context.strategy.revision) ||
      context.strategy.revision < 0 ||
      !Array.isArray(context.observations) ||
      context.observations.length > 80 ||
      !Array.isArray(context.decisions) ||
      context.decisions.length > 30
    )
      return Response.json(
        { error: 'Invalid planning context' },
        { status: 400 },
      );
    const saved = await readSavedCredentials(request);
    const { openRouterApiKey } = credentialsForRequest(saved);
    const strategy = await callPlanner(
      context,
      openRouterApiKey,
      providerConfiguration(saved).plannerModel,
      AbortSignal.any([request.signal, AbortSignal.timeout(28000)]),
    );
    return Response.json(strategy, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return Response.json(
      {
        error:
          message.startsWith('OpenRouter ') ||
          message.startsWith('Invalid planner strategy')
            ? message
            : 'OpenRouter request failed or timed out. No mock fallback.',
      },
      { status: 503 },
    );
  }
}
