# Contributing

Thanks for contributing to Jev Reflex Autonomy Lab. Bug fixes, documentation,
simulation improvements, and reproducible experiments are welcome. Please follow
the [code of conduct](CODE_OF_CONDUCT.md).

## Get started

1. Fork the repository and clone your fork.
2. Use Node.js 22.13 or newer.
3. Install dependencies and start the development server:

   ```bash
   npm ci
   npm run dev
   ```

4. Open the printed URL and use **Local controller** mode to work without API keys.
5. Create a branch for your change.

Read the [README](README.md) for configuration and the
[architecture guide](ARCHITECTURE.md) for the simulation and provider boundaries.
Live API setup is optional and can incur provider charges. Keep credentials in
the ignored `.dev.vars` file; never include keys in commits, screenshots, or logs.

## Propose a change

Use a bug report for reproducible problems and a feature request for proposed
improvements. Discuss substantial changes in an issue before implementing them.
For simulation bugs, include the scenario seed, fleet size, controller mode,
System 2 setting, and confidence threshold. Remove sensitive data from mission
exports. Report vulnerabilities through the [security policy](SECURITY.md).

## Validate your work

Run the existing project checks:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

For behavior changes, add or update relevant coverage in `tests/reflex.test.ts`
and describe how you exercised the changed behavior. For UI changes, run a local
mission and check the affected controls, canvas, and telemetry; include a
screenshot when useful. Live provider timing can change outcomes even with the
same seed, so distinguish local-controller results from live-provider results.

## Open a pull request

Keep changes focused. Explain the problem, resulting behavior, and validation,
and link related issues. Note checks you could not run and why. Update relevant
documentation when changing configuration or behavior, and avoid unrelated
formatting or generated artifacts.

Contributions are provided under the project's [MIT license](LICENSE).
