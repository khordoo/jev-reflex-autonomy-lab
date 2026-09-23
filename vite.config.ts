import tailwindcss from '@tailwindcss/vite';
import vinext from 'vinext';
import { defineConfig, type PluginOption } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat', 'nodejs_compat_populate_process_env'],
  d1_databases: [],
  r2_buckets: [],
};

export default defineConfig(async () => {
  const isVercel =
    process.env.VERCEL === '1' ||
    process.env.DEPLOY_TARGET === 'vercel' ||
    process.env.NITRO_PRESET === 'vercel';
  const plugins: PluginOption[] = [tailwindcss(), ...vinext()];

  if (isVercel) {
    const { nitro } = await import('nitro/vite');
    plugins.push(nitro({ preset: 'vercel' }));
  } else {
    // Keep Wrangler and Miniflare state project-local. These are non-secret
    // tool settings; application environment belongs in ignored `.env*` files.
    process.env.WRANGLER_WRITE_LOGS ??= 'false';
    process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
    process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

    // Wrangler snapshots its log path while the Cloudflare plugin is imported.
    const { cloudflare } = await import('@cloudflare/vite-plugin');
    if (existsSync(resolve(process.cwd(), '.openai', 'hosting.json'))) {
      const { sites } = await import('@openai/sites-vite-plugin');
      plugins.push(sites());
    }
    plugins.push(
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    );
  }

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins,
  };
});
