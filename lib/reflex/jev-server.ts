import { ACTIONS, type Decision, type DecisionContext } from './types';
import { validateDecision } from './validation';
// Verified 2026-09-16: https://docs.typesafe.ai/introduction/quickstart and /api.
export function jevRequest(context: DecisionContext) {
  return {
    model: 'jev-latest',
    state: {
      agentId: context.agentId,
      mission: context.mission,
      observation: context.observation,
      strategy: context.strategy,
      units:
        'metres, seconds, radians. Positive bearing and TURN_RIGHT are clockwise in screen coordinates.',
    },
    questions: {
      action: {
        type: 'choice',
        instructions:
          'Choose the best immediate discrete action. Priorities: preserve the drone, follow the supplied strategy, progress toward destination, avoid needless maneuvers. Evaluate uncertainty honestly. Sensors give measurements, not recommendations.',
        criteria: {
          HOLD: 'Continue current heading and velocity.',
          TURN_LEFT:
            'Rotate heading counterclockwise by 0.22 radians, preserving speed.',
          TURN_RIGHT:
            'Rotate heading clockwise by 0.22 radians, preserving speed.',
          ACCELERATE: 'Increase speed by 5 m/s, maximum 65.',
          DECELERATE: 'Decrease speed by 7 m/s, minimum 12.',
          SCAN: 'Classify detected objects within 340 metres, preserving motion.',
          RETREAT: 'Reverse heading and set speed to 20 m/s.',
        },
      },
    },
  };
}
export function parseJevResponse(body: unknown): Decision {
  const answer = (
    body as {
      answers?: {
        action?: {
          type?: unknown;
          choice?: unknown;
          probabilities?: unknown;
          confidence?: unknown;
        };
      };
    }
  )?.answers?.action;
  if (
    !answer ||
    answer.type !== 'choice' ||
    !ACTIONS.includes(answer.choice as never)
  )
    throw new Error('Invalid Jev response');
  const decision = {
    action: answer.choice,
    probabilities: answer.probabilities,
    confidence: answer.confidence,
  } as Decision;
  validateDecision(decision);
  return decision;
}
export async function callJev(
  context: DecisionContext,
  key: string | undefined,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
) {
  if (!key)
    throw new Error(
      'Jev unavailable: set TYPESAFE_API_KEY in the server environment. No mock fallback.',
    );
  const start = performance.now();
  const response = await transport('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(jevRequest(context)),
    signal,
  });
  if (!response.ok)
    throw new Error(
      `Jev service returned HTTP ${response.status}. ${response.status === 429 || response.status === 529 ? 'Pause and retry later.' : 'Check server configuration.'}`,
    );
  const decision = parseJevResponse(await response.json());
  return { ...decision, apiLatencyMs: performance.now() - start };
}
