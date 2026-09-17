# Reflex / Phase 1

## Architecture proposed before implementation

TypeScript + React (Vinext), a Canvas 2D tactical renderer, and a fixed-step simulation. No graphical input goes to either provider. Coordinates are metres; time is seconds. One entity, `drone_001`, is instantiated, with all controller, strategy, observation, and telemetry state keyed by agent ID.

Data flow: world → sensors → DecisionProvider → confidence gate → action → physics → world. Below-threshold decisions ask StrategyProvider for a structured strategy; the existing local decision loop continues. The renderer reads world/controller state only.

Components and files:
- `lib/reflex/types.ts`: internal contracts, actions, observations, strategies and telemetry.
- `lib/reflex/world.ts`: seeded scenario, exact physics and action application.
- `lib/reflex/sensors.ts`: geometric measurements, no action recommendations.
- `lib/reflex/providers.ts`: explicit development mocks and browser proxies for Jev/OpenRouter.
- `lib/reflex/jev-server.ts`, `openrouter-server.ts`: isolated vendor-specific adapters.
- `lib/reflex/chart-data.ts`, `components/decision-charts.tsx`: two aligned telemetry charts.
- `lib/reflex/controller.ts`: bounded history, asynchronous decisions, confidence escalation, cancellation and errors.
- `components/mission-canvas.tsx`: tactical world visualization.
- `app/page.tsx`: controls, provider status, decision/strategy telemetry and export.
- `tests/reflex.test.ts`: core invariants and deterministic replay.

Key interfaces: DecisionProvider.decide(DecisionContext, AbortSignal) returns an internal typed Decision; StrategyProvider.plan(PlanningContext, AbortSignal) returns Strategy. These are application contracts, NOT TypeSafe SDK methods. Server adapters map documented vendor responses into these contracts.

Implementation phases: (1) world/sensors/actions and mock loop; (2) real Jev adapter after documentation inspection; (3) real reasoning provider; (4) tune actual confidence distribution and hero scenario. Both live adapters are implemented. See LIVE-VALIDATION.md for measured results and remaining account/service constraints.

Integration update: inspected the official TypeSafe quickstart/API reference (https://docs.typesafe.ai/introduction/quickstart and https://docs.typesafe.ai/api, 2026-09-16). The Jev server adapter maps the documented Choice API using `jev-latest` and Bearer authentication. Confidence is NOT assumed equal to selected probability. OpenRouter uses the user-selected `meta/muse-spark-1.3-contributor` with strict structured output and runtime validation. Credentials live in server environment variables; never in browser bundles or committed files.

Chart semantics: per-agent confidence samples and the gate at decision time are retained. No fake samples precede launch. Request failures create gaps, not zero confidence. Planner start/end events use actual simulation timestamps and retain measured wall duration, completion/failure status, provider and strategy revision. Both charts share a time domain; UI rendering does not create decision or planning events.

Mock policy: mock action probabilities are synthetic and labeled; displayed elapsed time measures the local mock call including its deliberate delay, never vendor API latency. Ambiguous observations reduce mock confidence; scenario stage/time never directly invokes the planner. Low-confidence actions are withheld (passive coast); high-confidence actions continue while planning. At most one decision and one planner request per agent are in flight, each with timeout and stale-result guards. Planner cooldown prevents repeated requests on the same unresolved context.

Hero scenario: calm corridor → crossing debris → signal-emitting unknown obstruction → low-confidence escalation → cautious bypass/scan strategy → resumed travel. Seeded field is a separate repeatable scenario. Physics owns collisions, health, battery, bounds and completion. Scanning exposes an object's observed classification; it does not select an action.
