# Integration validation

Baseline checkpoint: `e51584c37ed9362aee17b5afbaefe94e77f3a3fb` (before charts and OpenRouter).

- Unit/integration tests: 15 pass, including raw-confidence chart data, missing-data gaps, per-agent planner intervals, strict strategy parsing, incomplete output rejection and missing-key/HTTP failures.
- TypeScript and production build: pass.
- Live Jev ambiguous-object observation: TURN_RIGHT, confidence 0.33, selected probability 0.43, API time 387 ms, local round trip 453 ms. Threshold 0.70 would withhold this action and request a strategy.
- Live OpenRouter model: `meta/muse-spark-1.3-contributor`. Initial request denied HTTP 403 requiring 18+ confirmation. After user confirmation, retry returned HTTP 404 because the account privacy policy excludes paid training endpoints. No substitute model was called and no account settings were changed by the agent.
- Broader live mission behavior and confidence tuning remain to be evaluated; the deterministic mock hero test still completes without collisions.
- Previous Sites publication failed while waiting for its TLS certificate. Local preview continues independently.

No credentials appear in this record. Local runtime keys are stored only in the Git-ignored `.dev.vars` file.
