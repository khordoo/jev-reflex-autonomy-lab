# Reflex — autonomous drone lab

Run `npm install`, then `npm run dev`. Open the printed local URL and launch the mission. `npm run build` creates the production Worker. `npx tsc --noEmit` checks types.

This is the first runnable architecture/simulation increment. Both decision and planning providers are development mocks, explicitly labeled in the UI. Mock call times are measured wall-clock durations including intentional simulation delays. Probabilities are synthetic. Selecting Jev demonstrates the unconfigured failure path, with no silent fallback.

The real Jev HTTP adapter is implemented behind `/api/decision` using the official quickstart and API reference inspected on 2026-09-16: https://docs.typesafe.ai/introduction/quickstart and https://docs.typesafe.ai/api. It uses `POST https://api.typesafe.ai/v1/systemone`, Bearer authentication, `jev-latest`, and a Choice question over the seven actions. Reported confidence is preserved independently of action probability. Set `TYPESAFE_API_KEY` in the server environment (or Worker runtime secret), then select Jev. Never use a `NEXT_PUBLIC_` variable for credentials. No live request was made during development; actual behavior and confidence thresholds need validation with your account. System 2 remains an explicitly labeled mock pending provider/model configuration.

The hero scenario is scripted; seeded field generation is repeatable. Actual provider latency affects trajectories, so a seed alone does not guarantee identical asynchronous replay. Export includes initial seed, final world, per-agent observations, probabilities, action gate results, measured call times, strategy revisions and planner timing. Decision outcomes are snapshots at execution; final physics outcomes are in exported world state. History is bounded in memory; reset clears it. Browser background throttling slows simulation time.

Tests: `npx esbuild tests/reflex.test.ts --bundle --platform=node --format=esm --outfile=/tmp/reflex-tests.mjs && node --test /tmp/reflex-tests.mjs`.

The optional WebMCP integration exposes `read_mission_status` and `set_mission_running` when supported. No compatible browser tool invocation context was available to validate it; this is not a claim of tested browser support. UI browser testing was not performed. Core tests, TypeScript validation, route smoke checks and the production build are the verified checks.
