import { env } from 'cloudflare:workers';
import { callJev } from '@/lib/reflex/jev-server';
import type { DecisionContext } from '@/lib/reflex/types';
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: 'Cross-origin requests are not supported' },
      { status: 403 },
    );
  try {
    const text = await request.text();
    if (text.length > 50000)
      return Response.json({ error: 'Observation too large' }, { status: 413 });
    const context = JSON.parse(text) as DecisionContext;
    if (
      typeof context.agentId !== 'string' ||
      context.agentId.length > 80 ||
      typeof context.mission !== 'string' ||
      !context.observation ||
      context.observation.observerId !== context.agentId ||
      !Array.isArray(context.observation.detections) ||
      context.observation.detections.length > 100 ||
      !context.strategy ||
      context.strategy.agentId !== context.agentId
    )
      return Response.json(
        { error: 'Invalid decision context' },
        { status: 400 },
      );
    const key =
      (env as { TYPESAFE_API_KEY?: string }).TYPESAFE_API_KEY ||
      process.env.TYPESAFE_API_KEY;
    const deadline = performance.now() + 5500;
    const attempt = () =>
      callJev(
        context,
        key,
        AbortSignal.any([
          request.signal,
          AbortSignal.timeout(
            Math.min(3000, Math.max(1, deadline - performance.now())),
          ),
        ]),
      );
    const decide = async () => {
      let lastError: unknown;
      for (let tries = 0; tries < 2; tries++) {
        try {
          return await attempt();
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : '';
          if (!/HTTP 5\d\d/.test(message)) throw error;
        }
      }
      throw lastError;
    };
    return Response.json(await decide(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const safe =
      message.startsWith('Jev ') || message.startsWith('Invalid Jev')
        ? message
        : message
          ? `Jev request failed: ${message}`
          : 'Jev request failed or timed out. No mock fallback.';
    return Response.json({ error: safe }, { status: 503 });
  }
}
