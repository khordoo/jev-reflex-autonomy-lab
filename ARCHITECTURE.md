# Reflex / Phase 1

## Architecture proposed before implementation

TypeScript + React (Vinext), a Canvas 2D tactical renderer, and a fixed-step simulation. No graphical input goes to either provider. Coordinates are metres; time is seconds. One entity, `drone_001`, is instantiated, with all controller, strategy, observation, and telemetry state keyed by agent ID.

Data flow: world → sensors → DecisionProvider → confidence gate → action → physics → world. Below-threshold decisions ask StrategyProvider for a structured strategy; the existing local decision loop continues. The renderer reads world/controller state only.

Components and files:
- `lib/reflex/types.ts`: internal contracts, actions, observations, strategies and telemetry.
- `lib/reflex/world.ts`: seeded scenario, exact physics and action application.
- `lib/reflex/sensors.ts`: geometric measurements, no action recommendations.
- `lib/reflex/providers.ts`: explicit development mocks and unavailable Jev seam.
- `lib/reflex/controller.ts`: bounded history, asynchronous decisions, confidence escalation, cancellation and errors.
- `components/mission-canvas.tsx`: tactical world visualization.
- `app/page.tsx`: controls, provider status, decision/strategy telemetry and export.
- `tests/reflex.test.ts`: core invariants and deterministic replay.

Key interfaces: DecisionProvider.decide(DecisionContext, AbortSignal) returns an internal typed Decision; StrategyProvider.plan(PlanningContext, AbortSignal) returns Strategy. These are application contracts, NOT TypeSafe SDK methods. A future server adapter maps the documented vendor response into these contracts.

Implementation phases: (1) world/sensors/actions and mock loop; (2) real Jev adapter after inspecting supplied quickstart; (3) real reasoning provider after model/configuration selection; (4) tune actual confidence distribution and recorded hero scenario. The current artifact validates Phase 1 mechanics and mock cooperation only.

Integration update after the first mock slice: located and inspected the official TypeSafe quickstart and API reference (https://docs.typesafe.ai/introduction/quickstart and https://docs.typesafe.ai/api, 2026-09-16). `lib/reflex/jev-server.ts` maps the documented Choice API, using `jev-latest` and Bearer authentication, behind `app/api/decision/route.ts`. The client sees only our internal decision contract. Confidence is NOT assumed equal to the selected probability. Actual credentials, service latency, rate limits for this account, and useful real-model behavior remain unverified. System 2 provider/model remains pending. Credentials must live in server environment variables; never in browser bundles or committed files.

Mock policy: mock action probabilities are synthetic and labeled; displayed elapsed time measures the local mock call including its deliberate delay, never vendor API latency. Ambiguous observations reduce mock confidence; scenario stage/time never directly invokes the planner. Low-confidence actions are withheld (passive coast); high-confidence actions continue while planning. At most one decision and one planner request per agent are in flight, each with timeout and stale-result guards. Planner cooldown prevents repeated requests on the same unresolved context.

Hero scenario: calm corridor → crossing debris → signal-emitting unknown obstruction → low-confidence escalation → cautious bypass/scan strategy → resumed travel. Seeded field is a separate repeatable scenario. Physics owns collisions, health, battery, bounds and completion. Scanning exposes an object's observed classification; it does not select an action.
