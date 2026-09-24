# Jev Reflex Autonomy Lab

An interactive multi-drone autonomy simulation powered by [TypeSafe Jev](https://docs.typesafe.ai/), exploring a simple question: what happens when fast, typed System 1 reflexes can ask a slower System 2 reasoning model for advice without giving up control?

The fleet size is configurable from one to fifteen drones. System 2 can be turned off entirely, making it easy to compare Jev operating independently against Jev augmented with strategic guidance.

<p align="center">
  <a href="https://khordoo.github.io/jev-reflex-autonomy-lab/watch-demo.html">
    <img src="docs/media/reflex-dashboard.png" alt="Play the Jev Reflex Autonomy Lab demo" width="100%" />
  </a>
</p>
<p align="center">
  <a href="https://khordoo.github.io/jev-reflex-autonomy-lab/watch-demo.html"><strong>▶ Play the simulation demo</strong></a>
</p>

Each drone navigates independently with Jev as its System 1 reflex layer. When confidence falls below the configured threshold, an optional System 2 planner provides one-use strategic guidance through [OpenRouter](https://openrouter.ai/). Jev keeps steering while the planner responds.

## What the demo shows

- A configurable fleet of one to fifteen independently controlled drones
- Moving asteroids, debris, unidentified objects, and other drones treated as sensed contacts
- A System 2 toggle for running Jev alone or enabling strategic advice
- Per-drone decisions, confidence, latency, strategy revisions, and collision outcomes
- Seeded scenarios for repeatable obstacle layouts
- Canvas rendering separated from React telemetry and controls
- JSON export for inspecting an entire mission after the run

If one drone collides, only that drone is removed. The remaining fleet continues toward the shared destination. Arrived drones leave the active flight lane.

## Architecture

```text
React dashboard
├── experiment controls
├── per-drone telemetry
└── decision and latency charts

Canvas simulation loop
├── movement and collision detection
├── sensors and action projections
└── fleet rendering

System 1 — TypeSafe Jev
└── fast typed action decisions for every active drone

System 2 — OpenRouter / selected LLM (GLM 5.3 by default)
└── asynchronous one-use strategy advice when confidence is low
```

System 2 is advisory. It does not fly the drone directly, and Jev does not pause while waiting for it. The confidence chart uses purple only for a Jev decision that actually consumed returned System 2 guidance. The System 2 chart marks response arrival as a discrete event; wall-clock duration is shown separately in the latency chart.

For the runtime model, provider boundaries, and System 1/System 2 request flow, see [Architecture](ARCHITECTURE.md).

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the printed local URL. The app starts with development mocks, so it works without provider credentials.

Useful checks:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Use live providers

1. Copy the example configuration:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. Add your credentials. For the simplest setup, use OpenRouter for both Jev
   System 1 and the System 2 language model. The configuration below is all you
   need. If you have direct TypeSafe access, uncomment `TYPESAFE_API_KEY` and
   add your key; the app will prefer it for Jev while continuing to use
   OpenRouter for System 2.

   ```dotenv
   OPENROUTER_API_KEY=your_key
   OPENROUTER_MODEL=z-ai/glm-5.3
   CREDENTIALS_ENCRYPTION_KEY=generate-a-private-value-with-openssl-rand-base64-32

   # Optional: uncomment to prefer the direct TypeSafe route for System 1
   # TYPESAFE_API_KEY=your_key
   ```

3. Restart the development server and select **Live API**. The app starts in
   **Local controller** mode, which uses built-in rule-based decisions and
   requires no credentials; use it to verify that the app works. Live API uses
   Jev for System 1 and OpenRouter for optional System 2 advice. The flight
   environment remains simulated in both modes.

4. Press **Launch mission** when you are ready.

The Jev adapter prefers `POST https://api.typesafe.ai/v1/systemone` with `jev-latest`. Without a direct TypeSafe key, it calls `POST https://openrouter.ai/api/alpha/decisions` with `typesafe/jev-1.13`. Both routes use the same typed choice over the available flight actions. The System 2 planner uses OpenRouter's chat completions API with strict structured output. Server errors, rate limits, and context-size failures can retry through the configured fallback model.

### Save credentials in this browser

The Settings dialog can save personal OpenRouter and optional TypeSafe keys in an encrypted, `HttpOnly`, `Secure` (on HTTPS), `SameSite=Strict` cookie. The server decrypts the keys only when making provider requests. By default the cookie expires after one hour; **Remember for 7 days** extends it to seven days. Removing credentials from the dialog clears the cookie; revoke a key with its provider as well if you need to invalidate it.

Visitors with a saved OpenRouter key can choose their own System 2 model in Settings. The default is `z-ai/glm-5.3` (or the server's `OPENROUTER_MODEL` setting). The model choice is saved in the same encrypted browser cookie and applies to subsequent planner requests. Choose an OpenRouter model that supports structured output; availability and pricing depend on the provider.

Set `CREDENTIALS_ENCRYPTION_KEY` to a private random value of at least 32 characters in the server environment. For local development, generate one with `openssl rand -base64 32` and put it in `.dev.vars`. On a production deployment, add it as a server-only secret. User-saved credentials work without a database.

Server-configured provider keys remain available as a local development fallback. In production, they are disabled for visitors unless `ALLOW_SHARED_API_KEYS=true` is explicitly set. Enable that only when you intend visitors to use the deployment's shared provider account and credits.

## Experiment workflow

1. Choose the fleet size and scenario.
2. Turn System 2 advice on or off.
3. Select a reflex controller — with live credentials, switch the **Local controller / Live API** toggle to Live API.
4. Adjust the confidence threshold.
5. Launch the mission and switch between drones to inspect their decisions.
6. Export the mission JSON for deeper analysis.

The scenario seed controls the obstacle layout, but live provider latency can still change a trajectory. A seed is repeatable geometry, not a deterministic asynchronous replay.

## Telemetry semantics

- Green confidence: Jev made the decision using its current local context.
- Purple confidence point: that Jev decision consumed newly returned System 2 guidance.
- Purple System 2 bar: advisory response arrived at that mission time.
- Red System 2 bar: advisory request failed.
- Latency chart: measured wall-clock provider response time.

Exported telemetry includes the seed, fleet state, observations, probabilities, executed actions, confidence thresholds, provider timing, planner revisions, failures, and final outcomes.

## Cost

Simulation run cost depends on the fleet, scenario, mission duration, and selected
models. In one successful 15-drone run, Jev made 201 decisions across roughly
5.65 million tokens for about $0.24—approximately $0.0012 per decision.

**Cost control.** Larger fleets generate more decisions. For inexpensive
experiments, start with fewer drones and turn off System 2, since its language
model calls cost more than Jev decisions. You can also set
`OPENROUTER_MODEL=meta/muse-spark-1.3-contributor` for a lower-cost planner;
availability and rate limits may be tighter than the default model.

## Project status

This is an experimental autonomy visualization, not a production flight controller. The mock scenario and focused runtime checks cover the core simulation behavior. Live fleet success varies with model decisions, provider latency, seed, threshold, and fleet size.

## Deploy to Vercel (optional)

You can run the demo locally without deploying it. To host it for others, import the repository into Vercel and keep the project root at the repository root. Vercel uses the Nitro Vite adapter for the server-rendered app and API routes; the existing Cloudflare/Wrangler setup remains available for local development. The Vercel build uses `npm run build` and emits Vercel's Build Output API bundle.

Add one server-only environment variable in Vercel's project settings:

```text
CREDENTIALS_ENCRYPTION_KEY=<a private random value of at least 32 characters>
```

Generate a value with `openssl rand -base64 32`. Do not prefix it with `NEXT_PUBLIC_` or `VITE_`. Visitors provide their own OpenRouter or TypeSafe keys in the Settings dialog; the deployment does not need provider keys. `ALLOW_SHARED_API_KEYS` stays unset so visitors cannot use deployment provider credits. Local `.dev.vars` files are ignored and are not part of the deployment.

To collect page-view statistics, enable **Web Analytics** for the Vercel project in its dashboard. The app includes `@vercel/analytics`; enabling the service and deploying this branch makes the analytics endpoint available. The site discloses this in its [Privacy Notice](app/privacy/page.tsx). Visitors must agree to the [Terms of Use](app/terms/page.tsx) when saving a new provider key.
