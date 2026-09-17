import { ACTIONS, type Decision, type DecisionContext } from './types';
import { validateDecision } from './validation';
import { actionProjections } from './action-projection';
// Verified 2026-09-16: https://docs.typesafe.ai/introduction/quickstart and /api.
export function jevRequest(context: DecisionContext) {
  const projections = actionProjections(context.observation);
  const request = {
    model: 'jev-latest',
    state: {
      agentId: context.agentId,
      mission: context.mission,
      observation: context.observation,
      actionProjections: projections,
      strategy: {
        mode: context.strategy.mode,
        preferredSide: context.strategy.preferredSide,
        safetyDistance: context.strategy.safetyDistance,
        scanRequired: context.strategy.scanRequired,
      },
      units:
        'metres, seconds, radians. Positive bearing and TURN_RIGHT are clockwise in screen coordinates.',
    },
    questions: {
      action: {
        type: 'choice',
        instructions:
          'Choose the best next flight action. actionProjections gives neutral 8-second constant-velocity physics predictions for EVERY available action, not recommendations. Negative surfaceClearanceMetres means collision. Prefer a maneuver that avoids collision while reducing destinationDistanceAfter2Seconds. Once clearance is adequate, prioritize destination progress over maximizing clearance. Never keep braking if a turn avoids the obstacle and makes progress. Scan unknown objects when strategy requests it and projected motion permits. Positive destinationBearing is RIGHT; negative is LEFT. preferredSide is only a bypass tie-breaker, not a permanent turn command. Choose using current observations, not past locations.',
        criteria: {
          HOLD: 'Maintain motion when aligned with destination and clearance is adequate.',
          TURN_LEFT:
            'Turn left 0.22 radians: toward a NEGATIVE destinationBearing, or to pass left of an actual blocking object. Do not turn left toward a target on the right.',
          TURN_RIGHT:
            'Turn right 0.22 radians: toward a POSITIVE destinationBearing, or to pass right of an actual blocking object. Do not turn right toward a target on the left.',
          ACCELERATE: 'Increase speed by 5 m/s, maximum 65.',
          DECELERATE: 'Decrease speed by 7 m/s, minimum 12.',
          SCAN: 'Classify detected objects within 340 metres, preserving motion.',
          RETREAT: 'Reverse heading and set speed to 20 m/s.',
        },
      },
    },
  };
  request.questions.action.criteria = Object.fromEntries(
    Object.entries(request.questions.action.criteria).filter(
      ([action]) => action in projections,
    ),
  ) as typeof request.questions.action.criteria;
  return request;
}
export function parseJevResponse(
  body: unknown,
  expected: readonly string[] = ACTIONS,
): Decision {
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
  if (!answer.probabilities || typeof answer.probabilities !== 'object')
    throw new Error('Invalid Jev probabilities');
  if (
    !expected.includes(answer.choice as string) ||
    expected.some((a) => !(a in (answer.probabilities as object)))
  )
    throw new Error('Invalid Jev action distribution');
  const decision = {
    action: answer.choice,
    probabilities: Object.fromEntries(
      ACTIONS.map((a) => [
        a,
        (answer.probabilities as Record<string, number>)[a] ?? 0,
      ]),
    ),
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
  const request = jevRequest(context);
  const response = await transport('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok)
    throw new Error(
      `Jev service returned HTTP ${response.status}. ${response.status === 429 || response.status === 529 ? 'Pause and retry later.' : 'Check server configuration.'}`,
    );
  const decision = parseJevResponse(
    await response.json(),
    Object.keys(request.questions.action.criteria),
  );
  return { ...decision, apiLatencyMs: performance.now() - start };
}
