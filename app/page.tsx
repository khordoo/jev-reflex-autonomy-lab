'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowDown,
  ArrowUpRight,
  Cloud,
  Cpu,
  Download,
  LockKeyhole,
  Orbit,
  Pause,
  Pencil,
  Play,
  Radar,
  Route,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { MissionCanvas } from '@/components/mission-canvas';
import { DecisionCharts } from '@/components/decision-charts';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Controller } from '@/lib/reflex/controller';
import {
  JevDecisionProvider,
  MockDecisionProvider,
  MockStrategyProvider,
  OpenRouterStrategyProvider,
} from '@/lib/reflex/providers';
import {
  createWorld,
  DEFAULT_SEED,
  MAX_DRONES,
  stepWorld,
} from '@/lib/reflex/world';
import type { World } from '@/lib/reflex/types';
import { browserRegistry, registerMissionTools } from '@/lib/reflex/webmcp';

const INITIAL_DESTINATION_DISTANCE = 1400;
const WELCOME_DISMISSED_KEY = 'reflex-welcome-dismissed-v1';
function subscribeToWelcomeDismissal(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}
function welcomeWasDismissed() {
  try {
    return window.localStorage.getItem(WELCOME_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}
function welcomeWasDismissedOnServer() {
  return true;
}
type ProviderConfig = {
  jevConfigured: boolean;
  jevProvider: string;
  plannerConfigured: boolean;
  plannerModel: string;
  defaultPlannerModel: string;
  savedCredentials: { openRouter: boolean; typeSafe: boolean };
  credentialStorageEnabled: boolean;
  sharedKeysEnabled: boolean;
};

type CredentialFieldProps = {
  id: string;
  label: string;
  optional?: boolean;
  hint: string;
  saved: boolean;
  editing: boolean;
  value: string;
  pendingRemoval: boolean;
  disabled: boolean;
  onValueChange: (value: string) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onRequestRemoval: () => void;
  onUndoRemoval: () => void;
};

function CredentialField({
  id,
  label,
  optional = false,
  hint,
  saved,
  editing,
  value,
  pendingRemoval,
  disabled,
  onValueChange,
  onEdit,
  onCancelEdit,
  onRequestRemoval,
  onUndoRemoval,
}: CredentialFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (saved && editing && !pendingRemoval) inputRef.current?.focus();
  }, [saved, editing, pendingRemoval]);

  return (
    <fieldset className="credential-field">
      <legend className="credential-field-label" id={`${id}-field-label`}>
        {label} {optional && <span>optional</span>}
      </legend>
      {pendingRemoval ? (
        <output className="credential-pending-remove">
          <span>Will be removed when you save.</span>
          <button type="button" onClick={onUndoRemoval} disabled={disabled}>
            Undo
          </button>
        </output>
      ) : saved && !editing ? (
        <div className="saved-key-row">
          <span
            className="saved-key-mask"
            aria-label={`${label} saved; value hidden`}
          >
            ••••••••••••
          </span>
          <div className="saved-key-actions">
            <button
              type="button"
              className="credential-icon-button"
              onClick={onEdit}
              disabled={disabled}
              aria-label={`Replace ${label}`}
              title={`Replace ${label}`}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="credential-icon-button credential-remove-icon"
              onClick={onRequestRemoval}
              disabled={disabled}
              aria-label={`Remove ${label}`}
              title={`Remove ${label}`}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div className="credential-edit-control">
          <input
            ref={inputRef}
            id={id}
            type="password"
            autoComplete="off"
            aria-labelledby={`${id}-field-label`}
            spellCheck={false}
            value={value}
            placeholder={saved ? 'Paste replacement key' : 'Paste your key'}
            onChange={(event) => onValueChange(event.target.value)}
            disabled={disabled}
          />
          {saved && editing && (
            <button
              type="button"
              className="credential-icon-button credential-edit-cancel"
              onClick={onCancelEdit}
              disabled={disabled}
              aria-label={`Cancel replacing ${label}`}
              title="Cancel"
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      <small>{hint}</small>
    </fieldset>
  );
}

export default function Home() {
  const [droneCount, setDroneCount] = useState(3);
  const [system2Enabled, setSystem2Enabled] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('D_01');
  const [world, setWorld] = useState(() =>
    createWorld('seeded', DEFAULT_SEED, 3, false),
  );
  const [controller, setController] = useState(
    () =>
      new Controller(new MockDecisionProvider(), new MockStrategyProvider()),
  );
  const [running, setRunning] = useState(false),
    [sensors, setSensors] = useState(true),
    [showTrails, setShowTrails] = useState(false),
    [unknownEnabled, setUnknownEnabled] = useState(false),
    [threshold, setThreshold] = useState(20),
    [mode, setMode] = useState('mock'),
    [plannerMode, setPlannerMode] = useState('mock'),
    [seed, setSeed] = useState(DEFAULT_SEED);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>({
    jevConfigured: false,
    jevProvider: 'none',
    plannerConfigured: false,
    plannerModel: 'z-ai/glm-5.3',
    defaultPlannerModel: 'z-ai/glm-5.3',
    savedCredentials: { openRouter: false, typeSafe: false },
    credentialStorageEnabled: false,
    sharedKeysEnabled: false,
  });
  const [configError, setConfigError] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [dismissedWelcomeInPage, setDismissedWelcomeInPage] = useState(false);
  const dismissedWelcomeInBrowser = useSyncExternalStore(
    subscribeToWelcomeDismissal,
    welcomeWasDismissed,
    welcomeWasDismissedOnServer,
  );
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [typesafeKey, setTypesafeKey] = useState('');
  const [plannerModelDraft, setPlannerModelDraft] = useState<string | null>(
    null,
  );
  const [editingPlannerModel, setEditingPlannerModel] = useState(false);
  const [editingOpenRouter, setEditingOpenRouter] = useState(false);
  const [editingTypeSafe, setEditingTypeSafe] = useState(false);
  const [rememberCredentials, setRememberCredentials] = useState(false);
  const [removeOpenRouter, setRemoveOpenRouter] = useState(false);
  const [removeTypeSafe, setRemoveTypeSafe] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [credentialSaveComplete, setCredentialSaveComplete] = useState(false);
  const [credentialMessage, setCredentialMessage] = useState('');
  const [modelFeedback, setModelFeedback] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [chartTime, setChartTime] = useState(0);
  function clearCredentialDraft() {
    setOpenRouterKey('');
    setTypesafeKey('');
    setPlannerModelDraft(null);
    setEditingPlannerModel(false);
    setEditingOpenRouter(false);
    setEditingTypeSafe(false);
    setRemoveOpenRouter(false);
    setRemoveTypeSafe(false);
    setRememberCredentials(false);
    setAgreedToTerms(false);
    setCredentialSaveComplete(false);
    setCredentialMessage('');
    setModelFeedback(null);
  }
  function setCredentialDialogOpen(open: boolean) {
    if (!open) clearCredentialDraft();
    setCredentialsOpen(open);
  }
  function openProviderSettings() {
    setCredentialMessage('');
    void checkProviders();
    setCredentialDialogOpen(true);
  }
  function dismissWelcome() {
    setDismissedWelcomeInPage(true);
    try {
      window.localStorage.setItem(WELCOME_DISMISSED_KEY, '1');
    } catch {
      // The banner still closes when browser storage is unavailable.
    }
  }
  async function checkProviders() {
    try {
      const response = await fetch('/api/providers');
      if (!response.ok) throw new Error();
      const result = (await response.json()) as typeof providerConfig;
      setProviderConfig(result);
      setConfigError(false);
    } catch {
      setConfigError(true);
    } finally {
      setConfigReady(true);
    }
  }
  useEffect(() => {
    void checkProviders();
  }, []);
  function liveModeAvailable(config: ProviderConfig) {
    return (
      config.jevConfigured && (!system2Enabled || config.plannerConfigured)
    );
  }
  function selectLiveMode(config: ProviderConfig) {
    if (mode === 'jev' && plannerMode === 'openrouter') return;
    setMode('jev');
    setPlannerMode('openrouter');
    setThreshold(20);
    reset(
      world.scenario,
      'jev',
      'openrouter',
      seed,
      droneCount,
      system2Enabled,
      unknownEnabled,
      config.plannerModel,
    );
  }
  async function saveCredentials() {
    setModelFeedback(null);
    if (
      editingPlannerModel &&
      plannerModelDraft !== null &&
      !plannerModelDraft.trim()
    ) {
      setCredentialMessage(
        'Enter a model name, or use the reset icon to restore the default.',
      );
      return;
    }
    setCredentialBusy(true);
    setCredentialSaveComplete(false);
    setCredentialMessage('');
    try {
      const savingNewKey = Boolean(openRouterKey.trim() || typesafeKey.trim());
      const remainingOpenRouter =
        Boolean(openRouterKey.trim()) ||
        (providerConfig.savedCredentials.openRouter && !removeOpenRouter);
      const remainingTypeSafe =
        Boolean(typesafeKey.trim()) ||
        (providerConfig.savedCredentials.typeSafe && !removeTypeSafe);
      const removesLastKey =
        (removeOpenRouter || removeTypeSafe) &&
        !remainingOpenRouter &&
        !remainingTypeSafe;
      const body: Record<string, unknown> = {
        rememberForSevenDays: rememberCredentials,
        acceptedTerms: agreedToTerms,
      };
      if (openRouterKey.trim()) body.openRouterApiKey = openRouterKey.trim();
      if (typesafeKey.trim()) body.typesafeApiKey = typesafeKey.trim();
      if (removeOpenRouter) body.removeOpenRouter = true;
      if (removeTypeSafe) body.removeTypeSafe = true;
      const modelChanged =
        remainingOpenRouter &&
        plannerModelDraft !== null &&
        plannerModelDraft.trim() !== providerConfig.plannerModel;
      if (modelChanged)
        body.openRouterModel =
          plannerModelDraft.trim() === providerConfig.defaultPlannerModel
            ? null
            : plannerModelDraft.trim() || null;
      const response = removesLastKey
        ? await fetch('/api/providers', { method: 'DELETE' })
        : await fetch('/api/providers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      const result = (await response.json()) as
        | ProviderConfig
        | { error?: string; removed?: boolean };
      if (!response.ok)
        throw new Error(
          'error' in result ? result.error : 'Could not save credentials.',
        );
      let liveSelected = false;
      if (removesLastKey) await checkProviders();
      else {
        const updatedConfig = result as ProviderConfig;
        setProviderConfig(updatedConfig);
        if (modelChanged) controller.setPlannerName(updatedConfig.plannerModel);
        liveSelected = savingNewKey && liveModeAvailable(updatedConfig);
        if (liveSelected) selectLiveMode(updatedConfig);
      }
      setOpenRouterKey('');
      setTypesafeKey('');
      setPlannerModelDraft(null);
      setEditingPlannerModel(false);
      setEditingOpenRouter(false);
      setEditingTypeSafe(false);
      setRemoveOpenRouter(false);
      setRemoveTypeSafe(false);
      setAgreedToTerms(false);
      let message = removesLastKey
        ? 'Saved credentials removed from this browser.'
        : `Settings saved for ${rememberCredentials ? '7 days' : '1 hour'} in this browser.`;
      if (liveSelected)
        message +=
          ' Live API selected. Close Settings, then launch the mission.';
      else if (savingNewKey && system2Enabled)
        message +=
          ' Live API needs an OpenRouter key while System 2 is on. Add one or turn System 2 off.';
      setCredentialMessage(message);
      setCredentialSaveComplete(true);
      setConfigError(false);
      if (
        removesLastKey ||
        ((removeOpenRouter || removeTypeSafe) && !liveSelected)
      ) {
        setMode('mock');
        setPlannerMode('mock');
        reset(world.scenario, 'mock', 'mock');
      }
    } catch (error) {
      setCredentialMessage(
        error instanceof Error ? error.message : 'Could not save credentials.',
      );
    } finally {
      setCredentialBusy(false);
    }
  }
  async function savePlannerModel(model: string) {
    const nextModel = model.trim();
    const needsOpenRouterKey = !providerConfig.savedCredentials.openRouter;
    setCredentialMessage('');
    if (!nextModel) {
      setModelFeedback({
        message:
          'Enter a model name, or use the circular arrow to restore the default.',
        error: true,
      });
      return;
    }
    if (nextModel === providerConfig.plannerModel) {
      setEditingPlannerModel(false);
      setPlannerModelDraft(null);
      return;
    }
    if (needsOpenRouterKey && !openRouterKey.trim()) {
      setModelFeedback({
        message: 'Add an OpenRouter API key before saving a custom model.',
        error: true,
      });
      return;
    }
    if (needsOpenRouterKey && !agreedToTerms) {
      setModelFeedback({
        message: 'Agree to the Terms of Use before saving your OpenRouter key.',
        error: true,
      });
      return;
    }
    setCredentialBusy(true);
    setCredentialSaveComplete(false);
    setModelFeedback(null);
    try {
      const body: Record<string, unknown> = {
        openRouterModel:
          nextModel === providerConfig.defaultPlannerModel ? null : nextModel,
        rememberForSevenDays: rememberCredentials,
      };
      if (needsOpenRouterKey) {
        body.openRouterApiKey = openRouterKey.trim();
        body.acceptedTerms = true;
      }
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as
        | ProviderConfig
        | { error?: string };
      if (!response.ok)
        throw new Error(
          'error' in result ? result.error : 'Could not save model.',
        );
      const updatedConfig = result as ProviderConfig;
      setProviderConfig(updatedConfig);
      controller.setPlannerName(updatedConfig.plannerModel);
      if (needsOpenRouterKey && liveModeAvailable(updatedConfig))
        selectLiveMode(updatedConfig);
      setPlannerModelDraft(null);
      setEditingPlannerModel(false);
      if (needsOpenRouterKey) {
        setOpenRouterKey('');
        setEditingOpenRouter(false);
        setAgreedToTerms(false);
      }
      setModelFeedback({
        message:
          nextModel === providerConfig.defaultPlannerModel
            ? 'Default model restored and saved in this browser.'
            : `Model saved in this browser.${needsOpenRouterKey ? ' Live API selected.' : ''}`,
        error: false,
      });
      setCredentialSaveComplete(true);
      setConfigError(false);
    } catch (error) {
      setModelFeedback({
        message:
          error instanceof Error ? error.message : 'Could not save model.',
        error: true,
      });
    } finally {
      setCredentialBusy(false);
    }
  }
  async function removeCredentials() {
    setCredentialBusy(true);
    setCredentialSaveComplete(false);
    setCredentialMessage('');
    setModelFeedback(null);
    try {
      const response = await fetch('/api/providers', { method: 'DELETE' });
      const result = (await response.json()) as {
        error?: string;
      } & Partial<ProviderConfig>;
      if (!response.ok)
        throw new Error(result.error || 'Could not remove credentials.');
      await checkProviders();
      setOpenRouterKey('');
      setTypesafeKey('');
      setPlannerModelDraft(null);
      setEditingPlannerModel(false);
      setEditingOpenRouter(false);
      setEditingTypeSafe(false);
      setRemoveOpenRouter(false);
      setRemoveTypeSafe(false);
      setCredentialMessage('Saved credentials removed from this browser.');
      setCredentialSaveComplete(true);
      setMode('mock');
      setPlannerMode('mock');
      reset(world.scenario, 'mock', 'mock');
    } catch (error) {
      setCredentialMessage(
        error instanceof Error
          ? error.message
          : 'Could not remove credentials.',
      );
    } finally {
      setCredentialBusy(false);
    }
  }
  const [, refresh] = useState(0);
  const runningRef = useRef(false);
  runningRef.current = running;
  const drones = Object.values(world.agents);
  const arrived = drones.filter((d) => d.complete).length;
  const lost = drones.filter(
    (d) => d.health <= 0 || (!d.complete && d.battery <= 0),
  ).length;
  const finished = arrived + lost === drones.length;
  const control = controller.state(selectedAgent),
    drone = world.agents[selectedAgent] ?? drones[0],
    events = control.telemetry;
  const api = useRef({
    read: () => ({}),
    run: async (_running: boolean) => {},
  });
  api.current = {
    read: () => ({
      agentId: drone.id,
      time: world.time,
      running: runningRef.current,
      mode,
      confidence: control.decision?.confidence,
      strategy: control.strategy,
      health: drone.health,
      complete: drone.complete,
      system2Enabled,
      agents: drones.map((d) => ({
        id: d.id,
        health: d.health,
        complete: d.complete,
        position: d.position,
      })),
    }),
    run: async (value) => {
      if (value && finished)
        throw new Error('Reset the finished mission first');
      setRunning(value);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    },
  };
  useEffect(
    () =>
      registerMissionTools(
        browserRegistry(),
        () => api.current.read(),
        (value) => api.current.run(value),
      ),
    [],
  );
  useEffect(() => {
    controller.threshold = threshold / 100;
  }, [controller, threshold]);
  useEffect(() => {
    const current = world.agents[selectedAgent];
    if (!current) return;
    if (current.complete || current.health <= 0 || current.battery <= 0) {
      const next = Object.values(world.agents)
        .filter((d) => !d.complete && d.health > 0 && d.battery > 0)
        .sort(
          (a, b) =>
            Math.hypot(
              world.destination.x - a.position.x,
              world.destination.y - a.position.y,
            ) -
            Math.hypot(
              world.destination.x - b.position.x,
              world.destination.y - b.position.y,
            ),
        )[0];
      if (next) setSelectedAgent(next.id);
    }
  }, [world, selectedAgent, world.time]);
  useEffect(() => {
    controller.activate();
    let frame = 0,
      previous = performance.now(),
      accumulated = 0,
      lastUI = 0,
      lastChart = 0;
    const loop = (now: number) => {
      const delta = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      if (runningRef.current) {
        accumulated += delta;
        while (accumulated >= 1 / 60) {
          stepWorld(world, 1 / 60);
          accumulated -= 1 / 60;
        }
        controller.tick(world);
        if (now - lastChart >= 1000) {
          setChartTime(world.time);
          lastChart = now;
        }
        if (
          Object.values(world.agents).every(
            (d) => d.complete || d.health <= 0 || d.battery <= 0,
          )
        ) {
          setChartTime(world.time);
          setRunning(false);
        }
      }
      if (now - lastUI >= 250) {
        refresh((n) => n + 1);
        lastUI = now;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      controller.dispose();
    };
  }, [world, controller]);
  function reset(
    scenario: World['scenario'] = world.scenario,
    provider = mode,
    planner = plannerMode,
    nextSeed = seed,
    nextCount = droneCount,
    nextSystem2 = system2Enabled,
    nextUnknownEnabled = unknownEnabled,
    nextPlannerModel = providerConfig.plannerModel,
  ) {
    controller.dispose();
    setRunning(false);
    setChartTime(0);
    setSelectedAgent('D_01');
    setWorld(createWorld(scenario, nextSeed, nextCount, nextUnknownEnabled));
    const next = new Controller(
      provider === 'mock'
        ? new MockDecisionProvider()
        : new JevDecisionProvider(),
      planner === 'mock'
        ? new MockStrategyProvider()
        : new OpenRouterStrategyProvider(nextPlannerModel),
    );
    next.threshold = threshold / 100;
    next.system2Enabled = nextSystem2;
    setController(next);
  }
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            version: 3,
            scenario: world.scenario,
            seed: world.seed,
            mode,
            plannerMode,
            threshold,
            droneCount: drones.length,
            system2Enabled,
            world,
            events: Object.values(controller.agents)
              .flatMap((agent) => agent.telemetry)
              .sort((a, b) => a.simulationTime - b.simulationTime),
            planningEvents: Object.values(controller.agents)
              .flatMap((agent) => agent.planningEvents)
              .sort((a, b) => a.startedAt - b.startedAt),
            failures: controller.failures,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reflex-${world.seed}-telemetry.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const confidence = Math.round((control.decision?.confidence ?? 0) * 100),
    latest = events.at(-1),
    escalations = events.filter((e) => e.escalated).length,
    distanceToDestination = Math.hypot(
      world.destination.x - drone.position.x,
      world.destination.y - drone.position.y,
    ),
    destinationProgress = Math.min(
      100,
      Math.max(
        0,
        (1 - distanceToDestination / INITIAL_DESTINATION_DISTANCE) * 100,
      ),
    );
  const showGettingStarted =
    !dismissedWelcomeInPage &&
    !dismissedWelcomeInBrowser &&
    configReady &&
    !configError &&
    providerConfig.credentialStorageEnabled &&
    !providerConfig.jevConfigured;
  const hasPendingCredentialChanges = Boolean(
    openRouterKey.trim() ||
    typesafeKey.trim() ||
    removeOpenRouter ||
    removeTypeSafe ||
    (plannerModelDraft !== null &&
      plannerModelDraft.trim() !== providerConfig.plannerModel),
  );
  const showDoneButton = credentialSaveComplete && !hasPendingCredentialChanges;
  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <Zap size={23} />
          </span>
          <span>
            reflex<span className="brand-dot">.</span>
          </span>
          <span className="lab-label">AUTONOMY LAB</span>
        </div>
        <div className="topbar-controls">
          <span className="connection-chip">
            {mode === 'mock'
              ? 'LOCAL · no API key needed'
              : providerConfig.savedCredentials.openRouter ||
                  providerConfig.savedCredentials.typeSafe
                ? 'LIVE · your saved keys'
                : 'LIVE · shared provider key'}
          </span>
          <button
            className={`settings-button${showGettingStarted ? ' is-guided' : ''}`}
            onClick={openProviderSettings}
          >
            <Settings2 size={15} /> Settings
          </button>
        </div>
        <div className="top-meta">
          <span className="status-dot" /> {drones.length} DRONE EXPERIMENT{' '}
          <span className="version">PHASE 01</span>
        </div>
      </header>
      {showGettingStarted && (
        <aside className="welcome-strip" aria-label="Getting started">
          <Cloud size={18} aria-hidden="true" />
          <p>
            <strong>Want to try live calls?</strong> Local controller works now
            without a key. For live mode, add a provider key in Settings, select
            Live API, then Launch mission.
          </p>
          <button
            type="button"
            className="welcome-setup-button"
            onClick={openProviderSettings}
          >
            Set up live calls
          </button>
          <button
            type="button"
            className="welcome-dismiss-button"
            onClick={dismissWelcome}
            aria-label="Dismiss getting started tip"
            title="Dismiss"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </aside>
      )}
      <Dialog open={credentialsOpen} onOpenChange={setCredentialDialogOpen}>
        <DialogContent className="credentials-dialog">
          <DialogHeader>
            <DialogTitle>Provider settings</DialogTitle>
            <DialogDescription>
              Local mode needs no credentials. Live calls use your provider
              account.
            </DialogDescription>
          </DialogHeader>
          <div className="credential-notice">
            <LockKeyhole size={18} aria-hidden="true" />
            <div>
              <strong>How your keys are handled</strong>
              <p>
                The server encrypts your keys into a cookie stored in this
                browser. This app has no key database. The server decrypts them
                to make your requests to OpenRouter or TypeSafe. You can remove
                the keys saved in this browser at any time using “Remove all
                saved keys” below.
              </p>
            </div>
          </div>
          {!providerConfig.credentialStorageEnabled && (
            <p className="credential-warning" role="alert">
              Secure key storage is not configured on this server, so personal
              keys cannot be saved yet.
            </p>
          )}
          <CredentialField
            id="openrouter-key"
            label="OpenRouter API key"
            hint="System 1 through OpenRouter and optional System 2 advice."
            saved={providerConfig.savedCredentials.openRouter}
            editing={editingOpenRouter}
            value={openRouterKey}
            pendingRemoval={removeOpenRouter}
            disabled={
              !providerConfig.credentialStorageEnabled || credentialBusy
            }
            onValueChange={setOpenRouterKey}
            onEdit={() => setEditingOpenRouter(true)}
            onCancelEdit={() => {
              setOpenRouterKey('');
              setEditingOpenRouter(false);
            }}
            onRequestRemoval={() => {
              setOpenRouterKey('');
              setEditingOpenRouter(false);
              setEditingPlannerModel(false);
              setPlannerModelDraft(null);
              setModelFeedback(null);
              setRemoveOpenRouter(true);
            }}
            onUndoRemoval={() => setRemoveOpenRouter(false)}
          />
          <div className="credential-model-field">
            <label htmlFor="planner-model">OpenRouter System 2 model</label>
            {!editingPlannerModel ? (
              <div className="credential-model-display">
                <span>
                  {providerConfig.plannerModel}
                  {providerConfig.plannerModel ===
                    providerConfig.defaultPlannerModel && (
                    <small> · default</small>
                  )}
                </span>
                <button
                  type="button"
                  className="credential-icon-button"
                  onClick={() => {
                    setEditingPlannerModel(true);
                    setPlannerModelDraft(providerConfig.plannerModel);
                    setModelFeedback(null);
                  }}
                  disabled={
                    !providerConfig.credentialStorageEnabled ||
                    credentialBusy ||
                    removeOpenRouter
                  }
                  aria-label="Edit OpenRouter System 2 model"
                  title="Edit model"
                >
                  <Pencil size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="credential-icon-button"
                  onClick={() =>
                    void savePlannerModel(providerConfig.defaultPlannerModel)
                  }
                  disabled={
                    !providerConfig.credentialStorageEnabled ||
                    credentialBusy ||
                    removeOpenRouter ||
                    providerConfig.plannerModel ===
                      providerConfig.defaultPlannerModel
                  }
                  aria-label="Restore and save the default OpenRouter System 2 model"
                  title="Restore default and save now"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="credential-edit-control">
                <input
                  id="planner-model"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={150}
                  autoFocus
                  value={plannerModelDraft ?? providerConfig.plannerModel}
                  onChange={(event) => {
                    setPlannerModelDraft(event.target.value);
                    setModelFeedback(null);
                  }}
                  disabled={
                    !providerConfig.credentialStorageEnabled ||
                    credentialBusy ||
                    removeOpenRouter
                  }
                />
                <button
                  type="button"
                  className="credential-icon-button"
                  onClick={() =>
                    void savePlannerModel(
                      plannerModelDraft ?? providerConfig.plannerModel,
                    )
                  }
                  disabled={
                    !providerConfig.credentialStorageEnabled ||
                    credentialBusy ||
                    removeOpenRouter ||
                    !plannerModelDraft?.trim()
                  }
                  aria-label="Save OpenRouter System 2 model"
                  title="Save model"
                >
                  <Save size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="credential-icon-button"
                  onClick={() => {
                    setEditingPlannerModel(false);
                    setPlannerModelDraft(null);
                    setModelFeedback(null);
                  }}
                  disabled={credentialBusy}
                  aria-label="Cancel editing OpenRouter System 2 model"
                  title="Cancel"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            )}
            <small>
              Used only when System 2 is on. A custom model needs an OpenRouter
              key and structured output support; costs vary. The save icon
              applies edits, and the circular arrow restores and saves the
              default immediately.
            </small>
            {modelFeedback && (
              <output
                className={`credential-model-message${modelFeedback.error ? ' is-error' : ''}`}
                role={modelFeedback.error ? 'alert' : 'status'}
              >
                {modelFeedback.message}
              </output>
            )}
          </div>
          <CredentialField
            id="typesafe-key"
            label="TypeSafe API key"
            optional
            hint="Used directly for System 1 when present."
            saved={providerConfig.savedCredentials.typeSafe}
            editing={editingTypeSafe}
            value={typesafeKey}
            pendingRemoval={removeTypeSafe}
            disabled={
              !providerConfig.credentialStorageEnabled || credentialBusy
            }
            onValueChange={setTypesafeKey}
            onEdit={() => setEditingTypeSafe(true)}
            onCancelEdit={() => {
              setTypesafeKey('');
              setEditingTypeSafe(false);
            }}
            onRequestRemoval={() => {
              setTypesafeKey('');
              setEditingTypeSafe(false);
              setRemoveTypeSafe(true);
            }}
            onUndoRemoval={() => setRemoveTypeSafe(false)}
          />
          <div className="credential-lifetime">
            <label className="credential-remember">
              <input
                type="checkbox"
                checked={rememberCredentials}
                onChange={(event) =>
                  setRememberCredentials(event.target.checked)
                }
                disabled={
                  !providerConfig.credentialStorageEnabled || credentialBusy
                }
              />
              Keep keys for 7 days when saving
            </label>
            <small>New saves expire after 1 hour unless selected.</small>
          </div>
          <p className="credential-revoke-note">
            Removing saved keys here does not revoke them with OpenRouter or
            TypeSafe. To invalidate a key, revoke it in your provider account.
            See our{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Notice
            </a>{' '}
            and{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer">
              Terms of Use
            </a>
            .
          </p>
          {(openRouterKey.trim() || typesafeKey.trim()) && (
            <label className="credential-agreement">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(event) => setAgreedToTerms(event.target.checked)}
                disabled={credentialBusy}
              />
              <span>
                I agree to the{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer">
                  Terms of Use
                </a>{' '}
                and acknowledge the{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer">
                  Privacy Notice
                </a>
                .
              </span>
            </label>
          )}
          {credentialMessage && (
            <output className="credential-message">{credentialMessage}</output>
          )}
          <DialogFooter className="credentials-footer">
            <button
              className="remove-credentials-button"
              onClick={() => void removeCredentials()}
              disabled={
                credentialBusy ||
                (!providerConfig.savedCredentials.openRouter &&
                  !providerConfig.savedCredentials.typeSafe)
              }
            >
              Remove all saved keys
            </button>
            <button
              type="button"
              className="save-credentials-button"
              onClick={() =>
                showDoneButton
                  ? setCredentialDialogOpen(false)
                  : void saveCredentials()
              }
              disabled={
                showDoneButton
                  ? credentialBusy
                  : !providerConfig.credentialStorageEnabled ||
                    credentialBusy ||
                    ((Boolean(openRouterKey.trim()) ||
                      Boolean(typesafeKey.trim())) &&
                      !agreedToTerms) ||
                    (!openRouterKey.trim() &&
                      !typesafeKey.trim() &&
                      !removeOpenRouter &&
                      !removeTypeSafe &&
                      (removeOpenRouter ||
                        (!providerConfig.savedCredentials.openRouter &&
                          !openRouterKey.trim()) ||
                        plannerModelDraft === null ||
                        plannerModelDraft.trim() ===
                          providerConfig.plannerModel))
              }
            >
              {showDoneButton
                ? 'Done'
                : credentialBusy
                  ? 'Saving…'
                  : removeOpenRouter || removeTypeSafe
                    ? 'Save changes'
                    : 'Save credentials'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <section className="heading">
        <div>
          <h1>Fast System 1 with optional System 2 guidance</h1>
          <p className="intro">
            Jev for real-time decisions. An LLM advises only when needed.
          </p>
        </div>
        <div className="mode-badge">
          <span className="amber-dot" />
          {mode === 'mock' && plannerMode === 'mock'
            ? 'DEVELOPMENT MOCK'
            : mode === 'jev' && plannerMode === 'openrouter'
              ? 'LIVE PROVIDERS SELECTED'
              : 'MIXED PROVIDERS'}
          <small>
            {mode === 'mock' ? 'Mock reflexes' : 'TypeSafe Jev'} ·{' '}
            {!system2Enabled
              ? 'System 2 off'
              : plannerMode === 'mock'
                ? 'mock planner'
                : `${providerConfig.plannerModel} planner`}
          </small>
        </div>
      </section>
      <div className="workspace">
        <section className="flight-panel">
          <div className="panel-bar">
            <div>
              <span className="status-dot" /> LIVE ENVIRONMENT{' '}
              <span className="muted">/ SECTOR 07 / ORION CORRIDOR</span>
            </div>
            <span className="mono">
              T + {world.time.toFixed(1).padStart(5, '0')}s
            </span>
          </div>
          <div className="map">
            <MissionCanvas
              world={world}
              sensors={sensors}
              showTrails={showTrails}
            />
            <div className="map-key">
              <span>
                <svg viewBox="-14 -12 35 24" aria-hidden="true">
                  <polygon
                    points="21,0 -14,-12 -7,0 -14,12"
                    fill="currentColor"
                  />
                </svg>{' '}
                DRONE
              </span>
              <span>○ OBJECT</span>
              <span>⌁ SENSOR LINK</span>
            </div>
            {control.planning && (
              <div className="escalation-banner planning-banner">
                <div>
                  <strong>REFLEX UNCERTAIN → SYSTEM 2</strong>
                  <span>Planning from recent observations</span>
                </div>
              </div>
            )}
            {finished && arrived > 0 && (
              <div className="escalation-banner success">
                <strong>
                  MISSION FINISHED · {arrived}/{drones.length} ARRIVED · {lost}{' '}
                  LOST
                </strong>
              </div>
            )}
            {finished && arrived === 0 && (
              <div className="escalation-banner failure">
                <strong>MISSION FINISHED · ALL DRONES LOST</strong>
              </div>
            )}
          </div>
          <div className="flight-stats">
            <div>
              <span>AGENT</span>
              <select
                aria-label="Selected drone"
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
              >
                {drones.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id} ·{' '}
                    {d.complete
                      ? 'Arrived'
                      : d.health <= 0
                        ? 'Lost'
                        : d.battery <= 0
                          ? 'Out of battery'
                          : 'Active'}
                  </option>
                ))}
              </select>
              <small>
                {arrived} arrived · {drones.length - arrived - lost} active ·{' '}
                {lost} lost
              </small>
            </div>
            <div>
              <span>VELOCITY</span>
              <strong>
                {world.time === 0
                  ? '0'
                  : Math.hypot(drone.velocity.x, drone.velocity.y).toFixed(
                      0,
                    )}{' '}
                <small>m/s</small>
              </strong>
            </div>
            <div>
              <span>TO DESTINATION</span>
              <strong>
                {distanceToDestination.toFixed(0)} <small>m</small>
              </strong>
              <div className="dest-track">
                <i style={{ width: `${destinationProgress}%` }} />
              </div>
            </div>
          </div>
          <div className="transport">
            <button
              className="primary-button"
              onClick={() => setRunning((v) => !v)}
              disabled={finished}
            >
              {running ? <Pause size={16} /> : <Play size={16} />}
              {running
                ? 'Pause mission'
                : world.time
                  ? 'Resume mission'
                  : 'Launch mission'}
            </button>
            {mode === 'mock' && plannerMode === 'mock' && (
              <span className="local-controller-warning">
                <TriangleAlert size={14} aria-hidden="true" />
                Local controller · no live API
              </span>
            )}
            <button
              className="icon-button"
              aria-label="Reset mission"
              onClick={() => reset()}
            >
              <RotateCcw size={18} />
            </button>
            <button
              className={'text-button ' + (sensors ? 'selected' : '')}
              aria-pressed={sensors}
              onClick={() => setSensors((v) => !v)}
            >
              <Radar size={17} /> Sensors
            </button>
            <button
              className={'text-button ' + (showTrails ? 'selected' : '')}
              aria-pressed={showTrails}
              onClick={() => setShowTrails((v) => !v)}
            >
              <Route size={17} /> Trails
            </button>
            <button
              className={'text-button ' + (unknownEnabled ? 'selected' : '')}
              aria-pressed={unknownEnabled}
              onClick={() => {
                const enabled = !unknownEnabled;
                setUnknownEnabled(enabled);
                reset(
                  world.scenario,
                  mode,
                  plannerMode,
                  seed,
                  droneCount,
                  system2Enabled,
                  enabled,
                );
              }}
            >
              <Orbit size={17} /> Unidentified object
            </button>
            <div className="scenario-buttons">
              <button
                className={world.scenario === 'hero' ? 'selected' : ''}
                onClick={() => reset('hero')}
              >
                Hero scenario
              </button>
              <button
                className={world.scenario === 'seeded' ? 'selected' : ''}
                onClick={() => reset('seeded')}
              >
                Seeded field
              </button>
            </div>
          </div>
        </section>
        <aside className="intelligence">
          <section className="system-one">
            <div className="system-title">
              <span>
                <Zap size={17} /> SYSTEM 1
              </span>
              <span className="chip">{mode === 'mock' ? 'MOCK' : 'API'}</span>
            </div>
            <div className="system-name">
              Jev <span>/ reflex layer</span>
            </div>
            <p className="question">
              {drone.id} · “What should I do right now?”
            </p>
            <div className="action">
              <ArrowUpRight size={32} />
              <strong>
                {drone.health <= 0
                  ? 'LOST'
                  : drone.complete
                    ? 'ARRIVED'
                    : drone.battery <= 0
                      ? 'OUT OF BATTERY'
                      : (control.decision?.action.replaceAll('_', ' ') ??
                        'AWAITING INPUT')}
              </strong>
            </div>
            <div className="decision-numbers">
              <div>
                <span>CONFIDENCE</span>
                <strong
                  className={
                    confidence && confidence < threshold ? 'amber' : ''
                  }
                >
                  {control.decision ? confidence : '—'}
                  <small>%</small>
                </strong>
              </div>
              <div>
                <span>
                  {mode === 'mock' ? 'MOCK CALL TIME' : 'API CALL TIME'}
                </span>
                <strong>
                  {control.decision ? control.latencyMs.toFixed(0) : '—'}
                  <small>ms</small>
                </strong>
              </div>
            </div>
            <div className="confidence-track">
              <i
                style={{
                  width: `${confidence}%`,
                  background: confidence < threshold ? '#efb97b' : undefined,
                }}
              />
              <b style={{ left: `${threshold}%` }} />
            </div>
            <div className="confidence-caption">
              <span>
                {latest
                  ? latest.escalated
                    ? 'Provisional action · strategy requested'
                    : 'Action executed'
                  : 'Waiting for launch'}
              </span>
              <span>gate {threshold}%</span>
            </div>
          </section>
          <div className={'bridge ' + (control.planning ? 'active' : '')}>
            <ArrowDown size={15} />
            {!system2Enabled
              ? 'SYSTEM 2 OFF · JEV STEERING'
              : control.planning
                ? 'SYSTEM 2 PLANNING · JEV STILL STEERING'
                : 'UNCERTAINTY TRIGGERS REASONING'}
          </div>
          <section
            className={'system-two ' + (control.planning ? 'thinking' : '')}
          >
            <div className="system-title">
              <span>✳ SYSTEM 2</span>
              <span className="chip">
                {!system2Enabled
                  ? 'DISABLED'
                  : control.planning
                    ? 'PLANNING'
                    : control.guidancePending
                      ? 'STRATEGY SET'
                      : 'STANDBY'}
              </span>
            </div>
            <div className="system-name">
              Reasoning <span>/ strategy layer</span>
            </div>
            <p className="question">“What should our strategy be?”</p>
            <div className="strategy">
              <span className="eyebrow">
                {control.strategy.revision
                  ? 'UPDATED STRATEGY'
                  : 'CURRENT STRATEGY'}
              </span>
              <strong>
                {control.strategy.mode === 'TRANSIT'
                  ? 'Preserve. Progress. Arrive.'
                  : `${control.strategy.scanRequired ? 'Scan. ' : ''}Bypass ${control.strategy.preferredSide}. Resume.`}
              </strong>
              <p>
                {system2Enabled
                  ? control.strategy.rationale
                  : 'Each drone navigates independently using System 1. No advisory requests are sent.'}
              </p>
            </div>
            <div className="planner-foot">
              <span>
                {plannerMode === 'mock'
                  ? 'Mock planner'
                  : `OpenRouter · ${providerConfig.plannerModel}`}
              </span>
              <span>
                REV {String(control.strategy.revision).padStart(2, '0')}
              </span>
            </div>
          </section>
        </aside>
      </div>
      {control.error && (
        <div role="alert" className="error-banner">
          {control.error}
        </div>
      )}
      {control.plannerError && (
        <div role="alert" className="error-banner">
          System 2: {control.plannerError}
        </div>
      )}
      <section className="lower-grid">
        <div className="telemetry">
          <div className="section-title">
            <h2>
              Decision history · {drone.id} <span>{events.length} events</span>
            </h2>
            <button className="text-button" onClick={download}>
              <Download size={15} /> Export Telemetry
            </button>
          </div>
          <DecisionCharts
            events={events}
            planningEvents={control.planningEvents}
            failures={controller.failures}
            time={chartTime}
            agentId={drone.id}
            decisionMode={controller.decisionProvider.mode}
            plannerMode={controller.planner.mode}
          />
        </div>
        <div className="settings">
          <h2>Experiment controls</h2>
          <div className="setting-row">
            <label htmlFor="drone-count">Number of drones</label>
            <select
              id="drone-count"
              value={droneCount}
              onChange={(e) => {
                const count = Number(e.target.value);
                setDroneCount(count);
                reset(world.scenario, mode, plannerMode, seed, count);
              }}
            >
              {Array.from({ length: MAX_DRONES }, (_, i) => i + 1).map(
                (count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="setting-row">
            <label htmlFor="system2-enabled">System 2 advice</label>
            <button
              id="system2-enabled"
              type="button"
              aria-label="System 2 advice"
              role="switch"
              aria-checked={system2Enabled}
              className={'toggle ' + (system2Enabled ? 'on' : '')}
              onClick={() => {
                const enabled = !system2Enabled;
                setSystem2Enabled(enabled);
                reset(
                  world.scenario,
                  mode,
                  plannerMode,
                  seed,
                  droneCount,
                  enabled,
                );
              }}
            >
              <i />
            </button>
          </div>
          <p>
            Changing fleet size, the unidentified object, or System 2 starts a
            fresh mission. Select a drone above to inspect its decisions. An
            obstacle impact removes that drone; the others continue.
          </p>
          <div className="setting-label">
            <span id="threshold-label">Escalation threshold</span>
            <strong>{threshold}%</strong>
          </div>
          <Slider
            aria-labelledby="threshold-label"
            value={[threshold]}
            min={5}
            max={99}
            step={1}
            onValueChange={(v) => setThreshold(Array.isArray(v) ? v[0] : v)}
          />
          <p>
            Confidence below the threshold alone requests a strategy, regardless
            of the objects present.
          </p>
          <div className="setting-row">
            <label htmlFor="provider">Decision provider</label>
            <Select
              value={mode}
              onValueChange={(v) => {
                if (v) {
                  setMode(v);
                  reset(world.scenario, v);
                }
              }}
            >
              <SelectTrigger id="provider">
                <SelectValue>
                  {mode === 'mock' ? 'Development mock' : 'TypeSafe Jev'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mock">Development mock</SelectItem>
                <SelectItem value="jev">TypeSafe Jev</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="setting-row">
            <label htmlFor="planner">Strategy provider</label>
            <Select
              value={plannerMode}
              onValueChange={(v) => {
                if (v) {
                  setPlannerMode(v);
                  reset(world.scenario, mode, v);
                }
              }}
            >
              <SelectTrigger id="planner">
                <SelectValue>
                  {plannerMode === 'mock' ? 'Development mock' : 'OpenRouter'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mock">Development mock</SelectItem>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="provider-setup">
            <span className={providerConfig.jevConfigured ? 'lime' : 'muted'}>
              Jev:{' '}
              {providerConfig.jevConfigured
                ? `configured via ${providerConfig.jevProvider}`
                : 'not configured'}
            </span>
            <span
              className={providerConfig.plannerConfigured ? 'purple' : 'muted'}
            >
              OpenRouter key:{' '}
              {providerConfig.plannerConfigured
                ? 'configured'
                : 'not configured'}
            </span>
            <small>{providerConfig.plannerModel}</small>
            <button
              className="text-button"
              onClick={() => void checkProviders()}
            >
              Refresh connection status
            </button>
            {configError && (
              <span className="amber">
                Could not read server configuration.
              </span>
            )}
          </div>
          <div className="live-toggle">
            <button
              className={mode === 'mock' ? 'selected' : ''}
              aria-pressed={mode === 'mock'}
              onClick={() => {
                setMode('mock');
                setPlannerMode('mock');
                reset(world.scenario, 'mock', 'mock');
              }}
            >
              <Cpu size={14} /> Local controller
            </button>
            <button
              className={mode === 'jev' ? 'selected' : ''}
              aria-pressed={mode === 'jev'}
              disabled={
                !providerConfig.jevConfigured ||
                (system2Enabled && !providerConfig.plannerConfigured)
              }
              onClick={() => {
                setMode('jev');
                setPlannerMode('openrouter');
                setThreshold(20);
                reset(world.scenario, 'jev', 'openrouter');
              }}
            >
              <Cloud size={14} /> Live API
            </button>
          </div>
          <p>
            Local controller: runs the built-in rule-based reflexes with no
            credentials. Live API: live TypeSafe Jev via{' '}
            {providerConfig.jevProvider}
            {system2Enabled
              ? ` + ${providerConfig.plannerModel}`
              : ' only'}{' '}
            over the network. The flight environment stays simulated in both
            modes.
            {mode === 'jev'
              ? ' Live mode sets a 20% starting gate; the gate remains adjustable.'
              : ''}
          </p>
          <div className="setting-row">
            <label htmlFor="seed">Scenario seed</label>
            <div className="seed-controls">
              <input
                id="seed"
                type="number"
                min="0"
                max="999999"
                value={seed}
                onChange={(e) =>
                  setSeed(
                    Math.max(0, Math.min(999999, Number(e.target.value) || 0)),
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    reset('seeded', mode, plannerMode, seed);
                  }
                }}
              />
              <button
                className="seed-button"
                onClick={() => reset('seeded', mode, plannerMode, seed)}
              >
                Set
              </button>
              <button
                className="seed-button"
                onClick={() => {
                  const nextSeed = Math.floor(Math.random() * 1_000_000);
                  setSeed(nextSeed);
                  reset('seeded', mode, plannerMode, nextSeed);
                }}
              >
                Randomize
              </button>
            </div>
          </div>
          <div className="setting-foot">
            <span>{escalations} escalations</span>
            <span>{drone.collisions.length} collisions</span>
          </div>
        </div>
      </section>
      <footer>
        <span>REFLEX LAB / MULTI-DRONE EXPERIMENT</span>
        <nav aria-label="Site policies">
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            Privacy
          </a>
          <a href="/terms" target="_blank" rel="noopener noreferrer">
            Terms
          </a>
        </nav>
      </footer>
    </main>
  );
}
