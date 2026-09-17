# Integration validation

## Latest verified live run (2026-09-17)

After making newly detected unknowns a first-class escalation signal: mission complete in 70.88 simulated seconds with 100% integrity and zero collisions. Jev confidence was above the 30% gate when the unknown first appeared, but the novelty boundary correctly invoked Muse Spark anyway. Muse returned a cautious right-side bypass with 120 m clearance; Jev continued steering and reached the destination. This confirms the failed screenshot was caused by routing/cooldown logic, not insufficient Muse reasoning.

After fixing the escalation boundary: mission complete in 22.05 simulated seconds; 77 real Jev decisions; median API latency 158 ms; confidence range 0.21–0.87; two completed Muse Spark plans; zero provider failures; zero collisions; 100% integrity. Raw trace: ignored `outputs/live-mission-40.json`. This is one successful run, not a reliability guarantee.

The 40% gate now triggers strategic escalation without vetoing Jev's local actions. Low-confidence actions are labeled provisional. Before this fix, the drone coasted during planning and collided. Jev now receives current geometry and neutral per-action physics projections, not stale planner rationale. Ineffective braking/acceleration/scanning options are omitted. All real action selection remains Jev's; numeric ranking is confined to the explicitly labeled mock. Muse Spark uses low reasoning effort. Keys and account access are now verified. All 17 tests pass.

## Earlier experiments

Baseline checkpoint: `e51584c37ed9362aee17b5afbaefe94e77f3a3fb` (before charts and OpenRouter).

- Unit/integration tests: 15 pass, including raw-confidence chart data, missing-data gaps, per-agent planner intervals, strict strategy parsing, incomplete output rejection and missing-key/HTTP failures.
- TypeScript and production build: pass.
- Live Jev ambiguous-object observation: TURN_RIGHT, confidence 0.33, selected probability 0.43, API time 387 ms, local round trip 453 ms. Threshold 0.70 would withhold this action and request a strategy.
- Live OpenRouter model: `meta/muse-spark-1.3-contributor`. Initial request denied HTTP 403 requiring 18+ confirmation. After user confirmation, retry returned HTTP 404 because the account privacy policy excludes paid training endpoints. No substitute model was called and no account settings were changed by the agent.
- Broader live mission behavior and confidence tuning remain to be evaluated; the deterministic mock hero test still completes without collisions.
- Previous Sites publication failed while waiting for its TLS certificate. Local preview continues independently.

No credentials appear in this record. Local runtime keys are stored only in the Git-ignored `.dev.vars` file.
