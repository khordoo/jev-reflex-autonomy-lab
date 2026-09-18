# Reflex Demo Handoff

## Multi-drone update (2026-09-18)

Work is on `feat/multi-drone-navigation`, branched from the current `main`.
The dashboard defaults to three drones and allows 1–8. They start at the same
x coordinate with 40 m vertical spacing. Every drone has independent Jev
requests, strategy state, telemetry, and arrival status. Select a drone in the
flight stats to inspect its charts and decision cards; JSON export includes
the entire fleet.

The System 2 switch resets the mission and disables all planner dispatch when
off. Jev remains active for every surviving drone. Current escalation is
confidence-only at 20% (older notes below about hazard/unknown gates are stale).
Every obstacle impact is now fatal to that drone; it disappears from the map
while the remaining drones continue. Mission completion waits for the whole
fleet to arrive, collide, or exhaust its battery. Active peers are sensed as
DRONE contacts with relative velocity and included in action projections.
Overlapping drone collision radii destroy both drones; arrived drones are
treated as docked and excluded from active traffic.

Validation: TypeScript passed; an in-memory runtime smoke check verified three
spaced starts, independent decisions, zero planner calls with System 2 off,
isolated fatal impact, survivor movement, and independent arrival. No unit tests
were written or changed. Live multi-drone provider performance and navigation
success across seeds still need user evaluation; arrival is not guaranteed.

## Repository state

- Branch: `fix/jev-timeout-errors`
- Latest implementation commit: `bf03b47 refine system 2 guidance telemetry`
- Earlier checkpoints:
  - `17d0858 fix: bound planner context and add model fallback`
  - `3013814 feat: make seeded scenarios route-aware`
- Tests were intentionally not run at the user's request. `git diff --check` passed before the implementation commit.

## Intended System 1 / System 2 behavior

- Jev is System 1 and continues steering while a System 2 request is in flight.
- System 2 is advisory; it does not directly control the drone.
- Returned System 2 guidance is consumed by exactly one subsequent Jev decision and then discarded.
- The Jev confidence chart is green for normal Jev decisions and purple only for the one decision that actually used returned System 2 guidance.
- The System 2 chart uses discrete bars at response arrival, not a filled request-duration area. Purple means advice returned; red means the request failed.
- The separate latency chart shows wall-clock response duration.
- The current escalation threshold is 20%.
- A newly detected unknown object explicitly requests System 2. Do not remove this assuming the Jev prompt will request it: delegation is controller-owned, and prompt text alone cannot dispatch System 2.
- Low confidence only re-escalates when the situation is also projected as hazardous.

## Models and provider handling

- Default System 2 model: `z-ai/glm-5.3`.
- Fallback model: `meta/muse-spark-1.3-contributor`.
- Provider/server errors, rate limits, and context-size failures are eligible for fallback.
- Planner context is bounded rather than appending the full trajectory indefinitely.

Observed realistic-request timings during manual endpoint checks:

- GLM 5.3: about 3.7 seconds.
- Muse Spark: about 8.8 seconds.
- Grok 4.6: about 7.1 seconds.
- DeepSeek V4 Flash: substantially slower for this workload, including when Wafer was pinned.

These were total response times for a realistic structured planner request, not first-token latency.

## Navigation changes

- Action projection now stops at the 35 m arrival radius when the projected path reaches the destination.
- Jev is instructed to prefer safe arrival and ignore hazards occurring after projected arrival.
- Seeded scenarios are route-aware, and the scenario seed can be changed through the UI.

## Important files

- `lib/reflex/controller.ts`: delegation, one-decision guidance consumption, escalation.
- `lib/reflex/openrouter-server.ts`: planner request, bounded context, model fallback.
- `lib/reflex/jev-server.ts`: System 1 prompt and action selection context.
- `lib/reflex/action-projection.ts`: projected hazards and destination-arrival horizon.
- `lib/reflex/chart-data.ts`: confidence/latency series semantics.
- `components/decision-charts.tsx`: green/purple steering attribution, response bars, latency chart.
- `lib/reflex/world.ts`: arrival radius and simulation behavior.
- `app/page.tsx`: threshold preset and dashboard controls.

## Next work

1. Run the existing checks/tests and fix only genuine regressions. The previous agent deliberately did not run them.
2. Visually verify that response bars render at `endedAt`, including failed and pending requests.
3. Re-run several seeds and confirm the drone no longer overshoots the destination while tracking irrelevant hazards.
4. After the user approves animation behavior, consider adding a short fading projected-path segment ahead of the drone. Keep it in the canvas/game renderer, derive it from current velocity/heading or the action projection, and do not update React state every frame.

## Product constraints from the user

- Avoid presenting System 2 as controlling the ship while Jev is merely waiting for advice.
- Preserve React for controls and telemetry, but keep high-frequency movement/rendering out of React state.
- Do not introduce the projected-path animation until the current chart and motion behavior are accepted.
- Be conservative with broad rewrites and keep iteration focused.
