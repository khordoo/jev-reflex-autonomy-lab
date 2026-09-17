# Reflex — autonomous drone lab

Run `npm install`, then `npm run dev`. Open the printed local URL and launch the mission. `npm run build` creates the production Worker. `npx tsc --noEmit` checks types.

The demo starts with explicit development mocks. Choose TypeSafe Jev and OpenRouter independently in Experiment controls to use real providers. Mock call times are measured wall-clock durations including intentional simulation delays; synthetic values stay labeled. Neither live provider silently falls back to a mock.

The Jev adapter behind `/api/decision` follows the official quickstart/API reference inspected on 2026-09-16: https://docs.typesafe.ai/introduction/quickstart and https://docs.typesafe.ai/api. It uses `POST https://api.typesafe.ai/v1/systemone`, Bearer authentication, `jev-latest`, and a Choice question over the seven actions. Reported confidence is preserved independently of selected-action probability.

System 2 calls OpenRouter's OpenAI-compatible `/api/v1/chat/completions` API with `meta/muse-spark-1.3-contributor`, strict JSON schema and runtime validation. The planner updates strategy only. Documentation: https://openrouter.ai/docs/api_reference/overview and https://openrouter.ai/docs/guides/features/structured-outputs. A different model can be configured with `OPENROUTER_MODEL`; no automatic model fallback is configured.

For local live calls, copy `.dev.vars.example` to `.dev.vars` and fill `TYPESAFE_API_KEY` and `OPENROUTER_API_KEY`. Restart the dev server after editing, then use Refresh connection status. `.dev.vars` is ignored by Git. Never use `NEXT_PUBLIC_` variables for credentials. Hosted environments require separate runtime secrets; local credentials are not copied to deployments. The contributor model may require OpenRouter account confirmation before it can run.

Decision history contains two aligned charts: raw returned confidence with the gate recorded at each decision, and actual planner activity intervals with strategy completion/failure markers. Both use simulation time, while planner durations retain measured wall time. Provider failures create gaps in the confidence curve; values are never filled in from the scenario. Pausing freezes physics; an already pending request can finish while paused.

The hero scenario is scripted; seeded field generation is repeatable. Actual provider latency affects trajectories, so a seed alone does not guarantee identical asynchronous replay. Export includes initial seed, final world, per-agent observations, probabilities, action gate results, measured call times, strategy revisions and planner timing. Decision outcomes are snapshots at execution; final physics outcomes are in exported world state. History is bounded in memory; reset clears it. Browser background throttling slows simulation time.

Tests: `npx esbuild tests/reflex.test.ts --bundle --platform=node --format=esm --outfile=/tmp/reflex-tests.mjs && node --test /tmp/reflex-tests.mjs`.

Explicit live smoke test (one request per provider): `npx esbuild scripts/live-smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/reflex-live-smoke.mjs && node /tmp/reflex-live-smoke.mjs`. Initial live Jev test returned TURN_RIGHT with confidence 0.33, selected-action probability 0.43, and API time 387 ms. This is one observation, not a latency benchmark. See `LIVE-VALIDATION.md` for subsequent results.

The optional WebMCP integration exposes `read_mission_status` and `set_mission_running` when supported. No compatible browser tool invocation context was available to validate it; this is not a claim of tested browser support. UI browser testing was not performed. Core tests, TypeScript validation, route smoke checks and the production build are the verified checks.
