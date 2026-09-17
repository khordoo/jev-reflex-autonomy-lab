import { ACTIONS, type Action, type Observation } from './types';
import { ARRIVAL_RADIUS } from './world';
// Neutral physics counterfactuals, not action scores, rankings or recommendations.
// Only sensed geometry is used. x is forward; y is right in the observer frame.
export function actionProjections(o: Observation) {
  const available = ACTIONS.filter(
    (a) =>
      !(a === 'DECELERATE' && o.speed <= 12.01) &&
      !(a === 'ACCELERATE' && o.speed >= 64.99) &&
      !(
        a === 'SCAN' &&
        !o.detections.some((d) => d.classification === 'UNKNOWN')
      ),
  );
  return Object.fromEntries(
    available.map((action: Action) => {
      const angle =
        action === 'TURN_LEFT'
          ? -0.22
          : action === 'TURN_RIGHT'
            ? 0.22
            : action === 'RETREAT'
              ? Math.PI
              : 0;
      const speed =
        action === 'ACCELERATE'
          ? Math.min(65, o.speed + 5)
          : action === 'DECELERATE'
            ? Math.max(12, o.speed - 7)
            : action === 'RETREAT'
              ? 20
              : o.speed;
      const dx = Math.cos(angle) * speed,
        dy = Math.sin(angle) * speed;
      const goalX = o.destinationDistance * Math.cos(o.destinationBearing);
      const goalY = o.destinationDistance * Math.sin(o.destinationBearing);
      const along = goalX * Math.cos(angle) + goalY * Math.sin(angle);
      const across = goalY * Math.cos(angle) - goalX * Math.sin(angle);
      const intersectsGoal = Math.abs(across) < ARRIVAL_RADIUS;
      const entryTime = o.destinationDistance < ARRIVAL_RADIUS
        ? 0
        : intersectsGoal && along > 0 && speed > 0
          ? (along - Math.sqrt(ARRIVAL_RADIUS ** 2 - across ** 2)) / speed
          : Infinity;
      const reachesDestination = entryTime >= 0 && entryTime < 8;
      const horizon = reachesDestination ? entryTime : 8;
      const worldAngle = o.heading + angle;
      const projectedX = o.position.x + Math.cos(worldAngle) * speed * horizon;
      const projectedY = o.position.y + Math.sin(worldAngle) * speed * horizon;
      const boundaryClearanceMetres = Math.round(
        Math.min(
          projectedX - o.bounds.minX,
          o.bounds.maxX - projectedX,
          projectedY - o.bounds.minY,
          o.bounds.maxY - projectedY,
        ),
      );
      const contacts = o.detections.map((d) => {
        const p = d.relativePosition,
          vx = d.relativeVelocityVector.x + o.speed - dx,
          vy = d.relativeVelocityVector.y - dy;
        const v2 = vx * vx + vy * vy;
        const t =
          v2 > 0.001
            ? Math.max(0, Math.min(horizon, -(p.x * vx + p.y * vy) / v2))
            : 0;
        return {
          id: d.id,
          surfaceClearanceMetres: Math.round(
            Math.hypot(p.x + vx * t, p.y + vy * t) - d.estimatedSize - 10,
          ),
          secondsToClosest: +t.toFixed(1),
        };
      });
      return [
        action,
        {
          speed,
          reachesDestination,
          secondsToArrival: reachesDestination ? +entryTime.toFixed(2) : null,
          projectionHorizonSeconds: horizon,
          boundaryClearanceMetres,
          destinationDistanceAfter2Seconds: Math.round(
            Math.hypot(
              goalX - dx * Math.min(2, horizon),
              goalY - dy * Math.min(2, horizon),
            ),
          ),
          contacts,
        },
      ];
    }),
  );
}
