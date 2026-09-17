export const ACTIONS = [
  'HOLD',
  'TURN_LEFT',
  'TURN_RIGHT',
  'ACCELERATE',
  'DECELERATE',
  'SCAN',
  'RETREAT',
] as const;
export type Action = (typeof ACTIONS)[number];
export type Vec = { x: number; y: number };
export type Drone = {
  id: string;
  position: Vec;
  velocity: Vec;
  heading: number;
  health: number;
  battery: number;
  trail: Vec[];
  scanned: string[];
  collisions: string[];
  complete: boolean;
};
export type SpaceObject = {
  id: string;
  position: Vec;
  velocity: Vec;
  radius: number;
  kind: 'ASTEROID' | 'DEBRIS' | 'UNKNOWN';
  signal: boolean;
  activeAt: number;
};
export type World = {
  time: number;
  seed: number;
  scenario: 'hero' | 'seeded';
  agents: Record<string, Drone>;
  objects: SpaceObject[];
  destination: Vec;
};
export type Detection = {
  relativePosition: Vec;
  relativeVelocityVector: Vec;
  id: string;
  classification: SpaceObject['kind'];
  classificationConfidence: number;
  distance: number;
  relativeBearing: number;
  relativeVelocity: number;
  estimatedSize: number;
  timeToClosestApproach: number | null;
  closestApproach: number;
  signal: boolean;
};
export type Observation = {
  observerId: string;
  time: number;
  position: Vec;
  heading: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  detections: Detection[];
  destinationDistance: number;
  destinationBearing: number;
  speed: number;
  health: number;
  battery: number;
};
export type Strategy = {
  agentId: string;
  mode: 'TRANSIT' | 'CAUTIOUS_BYPASS';
  preferredSide: 'left' | 'right';
  safetyDistance: number;
  scanRequired: boolean;
  rationale: string;
  revision: number;
};
export type Decision = {
  action: Action;
  probabilities: Record<Action, number>;
  confidence: number;
  apiLatencyMs?: number;
};
export type DecisionContext = {
  agentId: string;
  observation: Observation;
  strategy: Strategy;
  mission: string;
  actions: readonly Action[];
  controlMemory?: {
    recentActions: Action[];
    previousAction: Action | null;
    sameActionStreak: number;
  };
};
export type PlanningContext = DecisionContext & {
  observations: Observation[];
  decisions: Decision[];
};
export interface DecisionProvider {
  name: string;
  mode: 'mock' | 'live';
  decide(context: DecisionContext, signal: AbortSignal): Promise<Decision>;
}
export interface StrategyProvider {
  name: string;
  mode: 'mock' | 'live';
  plan(context: PlanningContext, signal: AbortSignal): Promise<Strategy>;
}
export type TelemetryEvent = {
  guidanceRevision?: number;
  timestamp: string;
  simulationTime: number;
  agentId: string;
  observation: Observation;
  decision: Decision;
  latencyMs: number;
  provider: string;
  threshold: number;
  executed: boolean;
  provisional: boolean;
  escalated: boolean;
  strategyBefore: Strategy;
  strategyAfter: Strategy;
  system2LatencyMs?: number;
  error?: string;
  outcome: { health: number; complete: boolean; collisions: number };
};
export type PlanningEvent = {
  id: string;
  agentId: string;
  provider: string;
  mode: 'mock' | 'live';
  startedAt: number;
  endedAt?: number;
  latencyMs?: number;
  status: 'planning' | 'completed' | 'failed';
  triggerConfidence: number;
  trigger?: 'confidence' | 'novel_unknown';
  strategyRevision?: number;
  error?: string;
};
export type AgentControl = {
  guidancePending: boolean;
  strategy: Strategy;
  observation?: Observation;
  decision?: Decision;
  latencyMs: number;
  planning: boolean;
  decisionPending: boolean;
  lastDecisionAt: number;
  lastPlanAt: number;
  error?: string;
  history: Observation[];
  telemetry: TelemetryEvent[];
  planningEvents: PlanningEvent[];
  escalatedUnknownIds: string[];
  plannerError?: string;
};
