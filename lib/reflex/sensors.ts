import type { Observation, World } from './types';
import { DRONE_RADIUS, wrapAngle } from './world';
export function observe(world: World, agentId: string): Observation {
  const d = world.agents[agentId];
  const contacts = [
    ...world.objects,
    ...Object.values(world.agents)
      .filter((peer) => peer.id !== agentId && !peer.complete && peer.health > 0 && peer.battery > 0)
      .map((peer) => ({
        id: peer.id, position: peer.position, velocity: peer.velocity,
        radius: DRONE_RADIUS, kind: 'DRONE' as const, signal: false, activeAt: 0,
      })),
  ];
  return {
    observerId: agentId,
    time: world.time,
    position: { ...d.position },
    heading: d.heading,
    bounds: { minX: 12, maxX: 1588, minY: 12, maxY: 708 },
    health: d.health,
    battery: d.battery,
    speed: Math.hypot(d.velocity.x, d.velocity.y),
    destinationDistance: Math.hypot(
      world.destination.x - d.position.x,
      world.destination.y - d.position.y,
    ),
    destinationBearing: wrapAngle(
      Math.atan2(
        world.destination.y - d.position.y,
        world.destination.x - d.position.x,
      ) - d.heading,
    ),
    detections: contacts
      .filter(
        (o) =>
          o.activeAt <= world.time &&
          Math.hypot(o.position.x - d.position.x, o.position.y - d.position.y) <
            340,
      )
      .map((o) => {
        const x = o.position.x - d.position.x,
          y = o.position.y - d.position.y,
          vx = o.velocity.x - d.velocity.x,
          vy = o.velocity.y - d.velocity.y;
        const distance = Math.hypot(x, y),
          v2 = vx * vx + vy * vy,
          t = v2 > 0.001 ? Math.max(0, -(x * vx + y * vy) / v2) : null;
        return {
          relativePosition: {
            x: x * Math.cos(d.heading) + y * Math.sin(d.heading),
            y: -x * Math.sin(d.heading) + y * Math.cos(d.heading),
          },
          relativeVelocityVector: {
            x: vx * Math.cos(d.heading) + vy * Math.sin(d.heading),
            y: -vx * Math.sin(d.heading) + vy * Math.cos(d.heading),
          },
          id: o.id,
          classification:
            o.kind === 'UNKNOWN' && d.scanned.includes(o.id)
              ? ('DEBRIS' as const)
              : o.kind,
          classificationConfidence:
            o.kind === 'UNKNOWN' && !d.scanned.includes(o.id) ? 0.42 : 1,
          distance,
          relativeBearing: wrapAngle(Math.atan2(y, x) - d.heading),
          relativeVelocity: (x * vx + y * vy) / Math.max(distance, 0.001),
          estimatedSize: o.radius,
          timeToClosestApproach: t,
          closestApproach:
            t === null ? distance : Math.hypot(x + vx * t, y + vy * t),
          signal: o.signal,
        };
      })
      .sort((a, b) => a.distance - b.distance),
  };
}
