'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  Download,
  Pause,
  Play,
  Radar,
  RotateCcw,
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
import { createWorld, stepWorld } from '@/lib/reflex/world';
import type { World } from '@/lib/reflex/types';
import { browserRegistry, registerMissionTools } from '@/lib/reflex/webmcp';
export default function Home() {
  const [world, setWorld] = useState(() => createWorld());
  const [controller, setController] = useState(
    () =>
      new Controller(new MockDecisionProvider(), new MockStrategyProvider()),
  );
  const [running, setRunning] = useState(false),
    [sensors, setSensors] = useState(true),
    [threshold, setThreshold] = useState(70),
    [mode, setMode] = useState('mock'),
    [plannerMode, setPlannerMode] = useState('mock'),
    [seed, setSeed] = useState(42);
  const [providerConfig, setProviderConfig] = useState({
    jevConfigured: false,
    plannerConfigured: false,
    plannerModel: 'meta/muse-spark-1.3-contributor',
  });
  const [configError, setConfigError] = useState(false);
  async function checkProviders() {
    try {
      const response = await fetch('/api/providers');
      if (!response.ok) throw new Error();
      const result = (await response.json()) as typeof providerConfig;
      setProviderConfig(result);
      setConfigError(false);
    } catch {
      setConfigError(true);
    }
  }
  useEffect(() => {
    void checkProviders();
  }, []);
  const [, refresh] = useState(0);
  const runningRef = useRef(false);
  runningRef.current = running;
  const control = controller.state('drone_001'),
    drone = world.agents.drone_001,
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
    }),
    run: async (value) => {
      if (value && (drone.complete || drone.health <= 0 || drone.battery <= 0))
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
    controller.activate();
    let frame = 0,
      previous = performance.now(),
      accumulated = 0,
      lastUI = 0;
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
        if (
          Object.values(world.agents).every(
            (d) => d.complete || d.health <= 0 || d.battery <= 0,
          )
        )
          setRunning(false);
      }
      if (now - lastUI > 80) {
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
  ) {
    controller.dispose();
    setRunning(false);
    setWorld(createWorld(scenario, seed));
    setController(
      new Controller(
        provider === 'mock'
          ? new MockDecisionProvider()
          : new JevDecisionProvider(),
        planner === 'mock'
          ? new MockStrategyProvider()
          : new OpenRouterStrategyProvider(providerConfig.plannerModel),
      ),
    );
  }
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            version: 1,
            scenario: world.scenario,
            seed: world.seed,
            mode,
            plannerMode,
            threshold,
            world,
            events,
            planningEvents: control.planningEvents,
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
  const stage = drone.complete
    ? 4
    : control.strategy.revision
      ? 4
      : control.planning
        ? 3
        : world.time >= 10
          ? 2
          : world.time >= 5
            ? 1
            : 0;
  const confidence = Math.round((control.decision?.confidence ?? 0) * 100),
    latest = events.at(-1),
    escalations = events.filter((e) => e.escalated).length;
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
        <div className="top-meta">
          <span className="status-dot" /> SINGLE AGENT EXPERIMENT{' '}
          <span className="version">PHASE 01</span>
        </div>
      </header>
      <section className="heading">
        <div>
          <p className="eyebrow">SYSTEM 1 + SYSTEM 2</p>
          <h1>What if an agent had reflexes?</h1>
          <p className="intro">
            Fast local decisions. Deliberate strategy. One mission.
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
            {plannerMode === 'mock' ? 'mock planner' : 'Muse Spark planner'}
          </small>
        </div>
      </section>
      <div className="workspace">
        <section className="flight-panel">
          <div className="panel-bar">
            <div>
              <span className="status-dot" /> LIVE ENVIRONMENT{' '}
              <span className="muted">/ SECTOR 07</span>
            </div>
            <span className="mono">
              T + {world.time.toFixed(1).padStart(5, '0')}s
            </span>
          </div>
          <div className="map">
            <MissionCanvas world={world} sensors={sensors} />
            <div className="map-caption">
              <span className="eyebrow">MISSION 001</span>
              <strong>Navigate the Orion corridor</strong>
              <span>Reach the destination. Preserve the drone.</span>
            </div>
            <div className="map-key">
              <span>◉ DRONE</span>
              <span>○ OBJECT</span>
              <span>⌁ SENSOR LINK</span>
            </div>
            {control.planning && (
              <div className="escalation-banner">
                <div>
                  <strong>REFLEX UNCERTAIN → SYSTEM 2</strong>
                  <span>Planning from recent observations</span>
                </div>
              </div>
            )}
            {drone.complete && (
              <div className="escalation-banner success">
                <strong>MISSION COMPLETE · {drone.health}% INTEGRITY</strong>
              </div>
            )}
          </div>
          <div className="flight-stats">
            <div>
              <span>AGENT</span>
              <strong>drone_001</strong>
            </div>
            <div>
              <span>VELOCITY</span>
              <strong>
                {Math.hypot(drone.velocity.x, drone.velocity.y).toFixed(0)}{' '}
                <small>m/s</small>
              </strong>
            </div>
            <div>
              <span>INTEGRITY</span>
              <strong>
                {drone.health}
                <small>%</small>
              </strong>
            </div>
            <div>
              <span>BATTERY</span>
              <strong>
                {drone.battery.toFixed(0)}
                <small>%</small>
              </strong>
            </div>
            <div>
              <span>TO DESTINATION</span>
              <strong>
                {Math.hypot(
                  world.destination.x - drone.position.x,
                  world.destination.y - drone.position.y,
                ).toFixed(0)}{' '}
                <small>m</small>
              </strong>
            </div>
          </div>
          <div className="transport">
            <button
              className="primary-button"
              onClick={() => setRunning((v) => !v)}
              disabled={drone.complete || drone.health <= 0}
            >
              {running ? <Pause size={16} /> : <Play size={16} />}
              {running
                ? 'Pause mission'
                : world.time
                  ? 'Resume mission'
                  : 'Launch mission'}
            </button>
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
            <p className="question">“What should I do right now?”</p>
            <div className="action">
              <ArrowUpRight size={32} />
              <strong>
                {control.decision?.action.replaceAll('_', ' ') ??
                  'AWAITING INPUT'}
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
                  ? latest.executed
                    ? 'Action executed'
                    : 'Low confidence · action withheld'
                  : 'Waiting for launch'}
              </span>
              <span>gate {threshold}%</span>
            </div>
          </section>
          <div className={'bridge ' + (control.planning ? 'active' : '')}>
            <ArrowDown size={15} />
            {control.planning
              ? 'ESCALATING FROM UNCERTAINTY'
              : 'UNCERTAINTY TRIGGERS REASONING'}
          </div>
          <section
            className={'system-two ' + (control.planning ? 'thinking' : '')}
          >
            <div className="system-title">
              <span>✳ SYSTEM 2</span>
              <span className="chip">
                {control.planning
                  ? 'PLANNING'
                  : control.strategy.revision
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
              <p>{control.strategy.rationale}</p>
            </div>
            <div className="planner-foot">
              <span>
                {plannerMode === 'mock'
                  ? 'Mock planner'
                  : 'OpenRouter · Muse Spark'}
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
      <section className="timeline">
        <div className="timeline-title">
          <span className="eyebrow">SCENARIO PROGRESSION</span>
          <span>
            {world.scenario === 'hero'
              ? 'The unknown signal'
              : `Seed ${world.seed}`}
          </span>
        </div>
        <div className="stages">
          {['Calm', 'Pressure', 'Ambiguity', 'Escalation', 'Execution'].map(
            (s, i) => (
              <div
                key={s}
                className={i === stage ? 'current' : i < stage ? 'passed' : ''}
              >
                <span>{String(i + 1).padStart(2, '0')}</span>
                {s}
                <i />
              </div>
            ),
          )}
        </div>
      </section>
      <section className="lower-grid">
        <div className="telemetry">
          <div className="section-title">
            <h2>
              Decision history <span>{events.length} events</span>
            </h2>
            <button className="text-button" onClick={download}>
              <Download size={15} /> Export JSON
            </button>
          </div>
          <DecisionCharts
            events={events}
            planningEvents={control.planningEvents}
            failures={controller.failures}
            time={world.time}
            threshold={threshold}
            agentId={drone.id}
            decisionMode={controller.decisionProvider.mode}
            plannerMode={controller.planner.mode}
          />
        </div>
        <div className="settings">
          <h2>Experiment controls</h2>
          <div className="setting-label">
            <label id="threshold-label">Escalation threshold</label>
            <strong>{threshold}%</strong>
          </div>
          <Slider
            aria-labelledby="threshold-label"
            value={[threshold]}
            min={30}
            max={99}
            step={1}
            onValueChange={(v) => setThreshold(Array.isArray(v) ? v[0] : v)}
          />
          <p>Confidence below this gate requests a strategy.</p>
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
              Jev key:{' '}
              {providerConfig.jevConfigured ? 'configured' : 'not configured'}
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
          <div className="setting-row">
            <label htmlFor="seed">Scenario seed</label>
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
            />
          </div>
          <div className="setting-foot">
            <span>{escalations} escalations</span>
            <span>{drone.collisions.length} collisions</span>
          </div>
        </div>
      </section>
      <footer>
        <span>REFLEX LAB / SINGLE-DRONE PROTOTYPE</span>
        <span>
          Structured observations → typed actions → measurable outcomes
        </span>
      </footer>
    </main>
  );
}
