import { ACTIONS, type Action, type Observation } from './types';
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
      const contacts = o.detections.map((d) => {
        const p = d.relativePosition,
          vx = d.relativeVelocityVector.x + o.speed - dx,
          vy = d.relativeVelocityVector.y - dy;
        const v2 = vx * vx + vy * vy;
        const t =
          v2 > 0.001
            ? Math.max(0, Math.min(8, -(p.x * vx + p.y * vy) / v2))
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
          destinationDistanceAfter2Seconds: Math.round(
            Math.hypot(
              o.destinationDistance * Math.cos(o.destinationBearing) - dx * 2,
              o.destinationDistance * Math.sin(o.destinationBearing) - dy * 2,
            ),
          ),
          contacts,
        },
      ];
    }),
  );
}
