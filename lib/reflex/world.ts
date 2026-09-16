import type { Action, Drone, World } from './types';
export const wrapAngle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
export function seeded(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (1664525 * n + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
export function createWorld(
  scenario: World['scenario'] = 'hero',
  seed = 42,
): World {
  const random = seeded(seed);
  return {
    time: 0,
    seed,
    scenario,
    destination: { x: 1500, y: 360 },
    agents: {
      drone_001: {
        id: 'drone_001',
        position: { x: 100, y: 360 },
        velocity: { x: 39, y: 0 },
        heading: 0,
        health: 100,
        battery: 100,
        trail: [],
        scanned: [],
        collisions: [],
        complete: false,
      },
    },
    objects:
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
              activeAt: 10,
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
        : Array.from({ length: 18 }, (_, i) => ({
            id: `object_${i}`,
            position: { x: 380 + random() * 1050, y: 100 + random() * 520 },
            velocity: { x: -8 + random() * 16, y: -8 + random() * 16 },
            radius: 15 + random() * 28,
            kind: i === 9 ? 'UNKNOWN' : 'ASTEROID',
            signal: i === 9,
            activeAt: 0,
          })),
  };
}
export function applyAction(world: World, agentId: string, action: Action) {
  const d = world.agents[agentId];
  if (!d || d.complete || d.health <= 0) return;
  let speed = Math.hypot(d.velocity.x, d.velocity.y);
  if (action === 'TURN_LEFT') d.heading -= 0.22;
  if (action === 'TURN_RIGHT') d.heading += 0.22;
  if (action === 'ACCELERATE') speed = Math.min(65, speed + 5);
  if (action === 'DECELERATE') speed = Math.max(12, speed - 7);
  if (action === 'RETREAT') {
    d.heading += Math.PI;
    speed = 20;
  }
  d.heading = wrapAngle(d.heading);
  d.velocity = {
    x: Math.cos(d.heading) * speed,
    y: Math.sin(d.heading) * speed,
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
  world.time += dt;
  for (const o of world.objects)
    if (o.activeAt <= world.time) {
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
          o.radius + 10 &&
        !d.collisions.includes(o.id)
      ) {
        d.collisions.push(o.id);
        d.health = Math.max(0, d.health - 25);
      }
    d.complete =
      Math.hypot(
        world.destination.x - d.position.x,
        world.destination.y - d.position.y,
      ) < 35;
    const last = d.trail.at(-1);
    if (!last || Math.hypot(last.x - d.position.x, last.y - d.position.y) > 3) {
      d.trail.push({ ...d.position });
      if (d.trail.length > 600) d.trail.shift();
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
