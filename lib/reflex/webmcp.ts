type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute(input: unknown): unknown;
};
type Registry = {
  registerTool(
    tool: Tool,
    options: { signal: AbortSignal },
  ): void | Promise<void>;
};
export function registerMissionTools(
  registry: Registry | undefined,
  read: () => unknown,
  setRunning: (running: boolean) => Promise<void>,
) {
  const lifecycle = new AbortController();
  if (registry?.registerTool) {
    const tools: Tool[] = [
      {
        name: 'read_mission_status',
        description:
          'Read current drone mission, provider mode and confidence state.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: () => read(),
      },
      {
        name: 'set_mission_running',
        description:
          'Start/resume or pause the visible drone simulation. Does not reset or change providers.',
        inputSchema: {
          type: 'object',
          properties: { running: { type: 'boolean' } },
          required: ['running'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async (input) => {
          if (
            !input ||
            typeof input !== 'object' ||
            typeof (input as { running?: unknown }).running !== 'boolean' ||
            Object.keys(input).some((k) => k !== 'running')
          )
            throw new Error('Expected only a boolean running field');
          await setRunning((input as { running: boolean }).running);
          return read();
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          registry.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Optional browser capability. */
      }
    }
  }
  return () => lifecycle.abort();
}
export function browserRegistry() {
  return (document as Document & { modelContext?: Registry }).modelContext;
}
