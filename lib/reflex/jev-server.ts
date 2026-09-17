import { ACTIONS, type Decision, type DecisionContext } from './types';
import { validateDecision } from './validation';
import { actionProjections } from './action-projection';
// Verified 2026-09-16: https://docs.typesafe.ai/introduction/quickstart and /api.
export function jevRequest(context: DecisionContext) {
  const projections = actionProjections(context.observation);
  const safeForwardActionExists = [
    'HOLD',
    'TURN_LEFT',
    'TURN_RIGHT',
    'DECELERATE',
  ].some(
    (action) =>
      projections[action]?.boundaryClearanceMetres >= 0 &&
      projections[action]?.contacts.every(
        (contact) => contact.surfaceClearanceMetres >= 0,
      ),
  );
  if (safeForwardActionExists) delete projections.RETREAT;
  const request = {
    model: 'jev-latest',
    state: {
      agentId: context.agentId,
      mission: context.mission,
      observation: context.observation,
      actionProjections: projections,
      controlMemory: context.controlMemory,
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
        instructions: {
          task: 'Choose the single best next flight action.',
          priority_order: [
            'Avoid projected collision and remain inside flight bounds.',
            'Follow the current strategy when it remains safe.',
            'Reduce destination distance.',
          ],
          projection_semantics: {
            horizon_seconds: 8,
            arrival_cutoff: 'Each action projection ends at arrival if earlier than eight seconds. Hazards after arrival are irrelevant; the mission stops within 35 metres of the destination.',
            meaning:
              'Neutral constant-velocity outcomes for every available action; they are measurements, not recommendations.',
            collision_boundary:
              'Negative surfaceClearanceMetres predicts collision.',
            flight_boundary:
              'Negative boundaryClearanceMetres predicts leaving the flight area and must be rejected.',
          },
          unknown_policy: {
            condition: 'UNKNOWN contact lies near the projected path.',
            response:
              'Treat as safety-critical regardless of confidence. Choose the turn with the best positive clearance, or DECELERATE if neither turn clears it. Do not wait for strategy.',
          },
          progress_policy:
            'Prefer forward motion toward the destination whenever any forward action is collision-free. Once clearance is adequate, prioritize destination progress. Do not keep braking when a safe turn makes progress.',
          arrival_policy:
            'Prefer an action with reachesDestination=true when its contacts and boundary clearances are safe. Do not turn away from a safe arrival to maximize clearance from a distant or receding object. Compare hazards only within each action projection horizon.',
          coordinate_convention: {
            positive_bearing: 'right / clockwise',
            negative_bearing: 'left / counter-clockwise',
          },
          strategy_scope:
            'preferredSide breaks bypass ties only; it is not a permanent turn command.',
          evidence_scope: 'Use the current observation, not past locations.',
          control_continuity:
            'Use controlMemory to avoid immediately reversing a recent turn unless the opposite action materially improves safety or is required to realign with the destination.',
        },
        criteria: {
          HOLD: {
            effect: 'Maintain current heading and speed.',
            choose_when:
              'Aligned with destination and all clearances are safe.',
            reject_when: 'Any projected path has inadequate clearance.',
          },
          TURN_LEFT: {
            effect: 'Turn left by 0.22 radians.',
            choose_when: [
              'destinationBearing is negative and the route is clear',
              'passing left gives the best safe clearance around a blocker',
            ],
            reject_when:
              'The target is right and turning left does not improve obstacle clearance.',
          },
          TURN_RIGHT: {
            effect: 'Turn right by 0.22 radians.',
            choose_when: [
              'destinationBearing is positive and the route is clear',
              'passing right gives the best safe clearance around a blocker',
            ],
            reject_when:
              'The target is left and turning right does not improve obstacle clearance.',
          },
          ACCELERATE: {
            effect: 'Increase speed by 5 m/s, capped at 65 m/s.',
            choose_when: 'Route is clear and added speed improves progress.',
            reject_when: 'Added speed reduces safety margin.',
          },
          DECELERATE: {
            effect: 'Decrease speed by 7 m/s, floored at 12 m/s.',
            choose_when:
              'No available turn has safe clearance or more reaction time is required.',
            reject_when:
              'A safe turn already avoids the blocker and makes progress.',
          },
          SCAN: {
            effect:
              'Classify detected contacts within 340 m without stopping motion.',
            choose_when:
              'Strategy requests a scan and current projected motion remains safe.',
            reject_when:
              'An immediate maneuver is required to avoid collision.',
          },
          RETREAT: {
            effect: 'Reverse heading and set speed to 20 m/s.',
            choose_when:
              'Every available forward action predicts collision; use only as an emergency escape.',
            reject_when:
              'HOLD, TURN_LEFT, TURN_RIGHT, or DECELERATE is collision-free.',
          },
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
