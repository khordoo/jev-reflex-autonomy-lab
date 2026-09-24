import type { Action, Drone, SpaceObject, World } from './types';
export const ARRIVAL_RADIUS = 35;
export const DRONE_RADIUS = 10;
export const GLANCING_PENETRATION_LIMIT = 0.1;
export const DOCK_SLOTS = 12;
export const DOCK_RING_RADIUS = ARRIVAL_RADIUS + 11;
export const TURN_RATE = 0.22;
export const CRUISE_SPEED = 52;
export const MIN_SPEED = 16;
export const MAX_SPEED = 90;
export const ACCELERATION_STEP = 6;
export const DECELERATION_STEP = 10;
export const RETREAT_SPEED = 26;
export const MAX_DRONES = 15;
export const wrapAngle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));

function projectedImpactPenetration(d: Drone, o: SpaceObject) {
  const relativePosition = {
    x: d.position.x - o.position.x,
    y: d.position.y - o.position.y,
  };
  const relativeVelocity = {
    x: d.velocity.x - o.velocity.x,
    y: d.velocity.y - o.velocity.y,
  };
  const speedSquared =
    relativeVelocity.x ** 2 + relativeVelocity.y ** 2;
  const closestTime =
    speedSquared > 0.001
      ? Math.max(
          0,
          -(
            relativePosition.x * relativeVelocity.x +
            relativePosition.y * relativeVelocity.y
          ) / speedSquared,
        )
      : 0;
  const closestDistance = Math.hypot(
    relativePosition.x + relativeVelocity.x * closestTime,
    relativePosition.y + relativeVelocity.y * closestTime,
  );
  return Math.max(
    0,
    1 - closestDistance / (o.radius + DRONE_RADIUS),
  );
}

function resolveGlancingImpact(d: Drone, o: SpaceObject) {
  const collisionRadius = o.radius + DRONE_RADIUS;
  let normalX = d.position.x - o.position.x;
  let normalY = d.position.y - o.position.y;
  let normalLength = Math.hypot(normalX, normalY);
  if (normalLength < 0.001) {
    normalX = o.velocity.x - d.velocity.x;
    normalY = o.velocity.y - d.velocity.y;
    normalLength = Math.hypot(normalX, normalY) || 1;
  }
  normalX /= normalLength;
  normalY /= normalLength;

  d.position = {
    x: o.position.x + normalX * (collisionRadius + 0.01),
    y: o.position.y + normalY * (collisionRadius + 0.01),
  };

  const relativeX = d.velocity.x - o.velocity.x;
  const relativeY = d.velocity.y - o.velocity.y;
  const inwardSpeed = relativeX * normalX + relativeY * normalY;
  const reflectedX =
    inwardSpeed < 0 ? relativeX - 1.2 * inwardSpeed * normalX : relativeX;
  const reflectedY =
    inwardSpeed < 0 ? relativeY - 1.2 * inwardSpeed * normalY : relativeY;
  d.velocity = {
    x: o.velocity.x + reflectedX * 0.65,
    y: o.velocity.y + reflectedY * 0.65,
  };
  d.heading = Math.atan2(d.velocity.y, d.velocity.x);
}
export function seeded(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (1664525 * n + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
export const DEFAULT_SEED = 987867;
export function createWorld(
  scenario: World['scenario'] = 'hero',
  seed = DEFAULT_SEED,
  droneCount = 1,
  includeUnknown = true,
): World {
  const random = seeded(seed);
  return {
    time: 0,
    seed,
    scenario,
    destination: { x: 1500, y: 360 },
    agents: Object.fromEntries(Array.from({ length: Math.max(1, Math.min(MAX_DRONES, Math.floor(droneCount) || 1)) }, (_, index) => {
      const count = Math.max(1, Math.min(MAX_DRONES, Math.floor(droneCount) || 1));
      const id = `D_${String(index + 1).padStart(2, '0')}`;
      const drift = (random() - 0.5) * 0.1;
      return [id, {
        id,
        position: { x: 100 + random() * 90, y: 12 + ((index + 0.5) / count) * (708 - 12) },
        velocity: { x: Math.cos(drift) * CRUISE_SPEED, y: Math.sin(drift) * CRUISE_SPEED },
        heading: drift,
        health: 100,
        battery: 100,
        trail: [],
        scanned: [],
        collisions: [],
        complete: false,
      }];
    })),
    objects: ((
      scenario === 'hero'
        ? [
            {
              id: 'asteroid_01',
              position: { x: 370, y: 245 },
              velocity: { x: -2, y: 3 },
              radius: 29,
              kind: 'ASTEROID',
              signal: false,
              activeAt: 0,
            },
            {
              id: 'asteroid_02',
              position: { x: 510, y: 480 },
              velocity: { x: -4, y: -3 },
              radius: 35,
              kind: 'ASTEROID',
              signal: false,
              activeAt: 0,
            },
            {
              id: 'debris_03',
              position: { x: 770, y: 145 },
              velocity: { x: -7, y: 14 },
              radius: 20,
              kind: 'DEBRIS',
              signal: false,
              activeAt: 5,
            },
            {
              id: 'debris_04',
              position: { x: 850, y: 540 },
              velocity: { x: -10, y: -12 },
              radius: 24,
              kind: 'DEBRIS',
              signal: false,
              activeAt: 6,
            },
            {
              id: 'unknown_05',
              position: { x: 950, y: 360 },
              velocity: { x: 0, y: 0 },
              radius: 72,
              kind: 'UNKNOWN',
              signal: true,
              activeAt: 3,
            },
            {
              id: 'asteroid_06',
              position: { x: 1280, y: 180 },
              velocity: { x: -3, y: 2 },
              radius: 44,
              kind: 'ASTEROID',
              signal: false,
              activeAt: 0,
            },
          ]
        : Array.from({ length: 18 }, (_, i) => {
            const unknown = i === 9;
            return {
              id: `object_${i}`,
              position: { x: 380 + random() * 1050, y: 100 + random() * 520 },
              velocity: unknown
                ? { x: 0, y: 0 }
                : { x: -8 + random() * 16, y: -8 + random() * 16 },
              radius: unknown ? 72 : 15 + random() * 28,
              kind: unknown ? ('UNKNOWN' as const) : ('ASTEROID' as const),
              signal: unknown,
              activeAt: unknown ? 1 : 0,
            };
          })
    ) as SpaceObject[]).filter(
      (object) => includeUnknown || object.kind !== 'UNKNOWN',
    ),
  };
}
export function applyAction(world: World, agentId: string, action: Action) {
  const d = world.agents[agentId];
  if (!d || d.complete || d.health <= 0) return;
  let speed = Math.hypot(d.velocity.x, d.velocity.y);
  let direction = 1;
  if (action === 'TURN_LEFT') d.heading -= TURN_RATE;
  if (action === 'TURN_RIGHT') d.heading += TURN_RATE;
  if (action === 'ACCELERATE')
    speed = Math.min(MAX_SPEED, speed + ACCELERATION_STEP);
  if (action === 'DECELERATE')
    speed = Math.max(MIN_SPEED, speed - DECELERATION_STEP);
  if (action === 'HOLD')
    speed =
      speed < CRUISE_SPEED
        ? Math.min(CRUISE_SPEED, speed + ACCELERATION_STEP)
        : Math.max(CRUISE_SPEED, speed - ACCELERATION_STEP);
  if (action === 'RETREAT') {
    speed = RETREAT_SPEED;
    direction = -1;
  }
  d.heading = wrapAngle(d.heading);
  d.velocity = {
    x: Math.cos(d.heading) * speed * direction,
    y: Math.sin(d.heading) * speed * direction,
  };
  if (action === 'SCAN')
    for (const o of world.objects)
      if (
        o.activeAt <= world.time &&
        Math.hypot(o.position.x - d.position.x, o.position.y - d.position.y) <
          340 &&
        !d.scanned.includes(o.id)
      )
        d.scanned.push(o.id);
}
export function stepWorld(world: World, dt: number) {
  const previousTime = world.time;
  world.time += dt;
  for (const o of world.objects)
    if (o.activeAt <= world.time) {
      if (
        world.scenario === 'seeded' &&
        o.signal &&
        previousTime < o.activeAt &&
        world.time >= o.activeAt
      ) {
        const drone = Object.values(world.agents).find((d) => !d.complete && d.health > 0 && d.battery > 0);
        if (!drone) continue;
        const dx = world.destination.x - drone.position.x;
        const dy = world.destination.y - drone.position.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const placementSeed = (world.seed * 2654435761) >>> 0;
        const forward = Math.min(
          500 + (placementSeed % 101),
          Math.max(0, distance - 200),
        );
        const offsetMagnitude = 100 + ((placementSeed >>> 8) % 61);
        const preferredSign = (placementSeed & 1) === 0 ? 1 : -1;
        const baseX = drone.position.x + (dx / distance) * forward;
        const baseY = drone.position.y + (dy / distance) * forward;
        const candidate = (sign: number) => ({
          x: baseX - (dy / distance) * offsetMagnitude * sign,
          y: baseY + (dx / distance) * offsetMagnitude * sign,
        });
        const preferred = candidate(preferredSign);
        const alternate = candidate(-preferredSign);
        const inBounds = (point: { x: number; y: number }) =>
          point.x >= 90 && point.x <= 1510 && point.y >= 90 && point.y <= 630;
        const position = inBounds(preferred) ? preferred : alternate;
        o.position = {
          x: Math.max(90, Math.min(1510, position.x)),
          y: Math.max(90, Math.min(630, position.y)),
        };
      }
      o.position.x += o.velocity.x * dt;
      o.position.y += o.velocity.y * dt;
    }
  for (const d of Object.values(world.agents)) {
    if (d.complete || d.health <= 0 || d.battery <= 0) continue;
    d.position.x = Math.max(
      12,
      Math.min(1588, d.position.x + d.velocity.x * dt),
    );
    d.position.y = Math.max(
      12,
      Math.min(708, d.position.y + d.velocity.y * dt),
    );
    d.battery = Math.max(0, d.battery - dt * 0.12);
    for (const o of world.objects)
      if (
        o.activeAt <= world.time &&
        Math.hypot(o.position.x - d.position.x, o.position.y - d.position.y) <
          o.radius + DRONE_RADIUS &&
        !d.collisions.includes(o.id)
      ) {
        d.collisions.push(o.id);
        const fatalImpact =
          projectedImpactPenetration(d, o) > GLANCING_PENETRATION_LIMIT;
        d.health = fatalImpact ? 0 : Math.max(0, d.health - 25);
        if (fatalImpact) d.velocity = { x: 0, y: 0 };
        else resolveGlancingImpact(d, o);
      }
    const arrived =
      d.health > 0 &&
      Math.hypot(
        world.destination.x - d.position.x,
        world.destination.y - d.position.y,
      ) < ARRIVAL_RADIUS;
    if (arrived && !d.complete) {
      const dockIndex =
        Object.values(world.agents).filter((p) => p.complete).length %
        DOCK_SLOTS;
      const angle =
        (dockIndex / DOCK_SLOTS) * Math.PI * 2 - Math.PI / 2;
      d.position = {
        x: world.destination.x + Math.cos(angle) * DOCK_RING_RADIUS,
        y: world.destination.y + Math.sin(angle) * DOCK_RING_RADIUS,
      };
      d.heading = Math.atan2(
        world.destination.y - d.position.y,
        world.destination.x - d.position.x,
      );
      d.velocity = { x: 0, y: 0 };
    }
    d.complete = arrived;
    const last = d.trail.at(-1);
    if (!last || Math.hypot(last.x - d.position.x, last.y - d.position.y) > 3) {
      d.trail.push({ ...d.position });
      if (d.trail.length > 600) d.trail.shift();
    }
  }
  // Compare all surviving drones after movement so pair outcomes do not
  // depend on iteration order. Arrived drones are docked off the flight lane.
  const flying = Object.values(world.agents).filter((d) => !d.complete && d.health > 0 && d.battery > 0);
  for (let i = 0; i < flying.length; i++) {
    for (let j = i + 1; j < flying.length; j++) {
      const a = flying[i], b = flying[j];
      if (Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) < DRONE_RADIUS * 2) {
        a.collisions.push(b.id);
        b.collisions.push(a.id);
        a.health = b.health = 0;
        a.velocity = { x: 0, y: 0 };
        b.velocity = { x: 0, y: 0 };
      }
    }
  }
}
export function outcome(d: Drone) {
  return {
    health: d.health,
    complete: d.complete,
    collisions: d.collisions.length,
  };
}
