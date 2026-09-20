import { env } from 'cloudflare:workers';
import { DEFAULT_PLANNER_MODEL } from '@/lib/reflex/openrouter-server';
export async function GET() {
  const settings = env as {
    TYPESAFE_API_KEY?: string;
    OPENROUTER_API_KEY?: string;
    OPENROUTER_MODEL?: string;
  };
  const typesafeConfigured = Boolean(
    settings.TYPESAFE_API_KEY || process.env.TYPESAFE_API_KEY,
  );
  const openRouterConfigured = Boolean(
    settings.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY,
  );
  return Response.json(
    {
      jevConfigured: typesafeConfigured || openRouterConfigured,
      jevProvider: typesafeConfigured
        ? 'TypeSafe direct'
        : openRouterConfigured
          ? 'OpenRouter'
          : 'none',
      plannerConfigured: openRouterConfigured,
      plannerModel:
        settings.OPENROUTER_MODEL ||
        process.env.OPENROUTER_MODEL ||
        DEFAULT_PLANNER_MODEL,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
