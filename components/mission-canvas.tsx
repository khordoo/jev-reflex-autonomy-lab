'use client';
import { useEffect, useRef } from 'react';
import type { World } from '@/lib/reflex/types';
import { seeded } from '@/lib/reflex/world';
export function MissionCanvas({
  world,
  sensors,
  showTrails,
}: {
  world: World;
  sensors: boolean;
  showTrails: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    const render = () => {
      const w = canvas.clientWidth,
        h = canvas.clientHeight,
        ratio = window.devicePixelRatio || 1;
      if (canvas.width !== w * ratio || canvas.height !== h * ratio) {
        canvas.width = w * ratio;
        canvas.height = h * ratio;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = '#070f17';
      ctx.fillRect(0, 0, w, h);
      const scale = Math.min(w / 1600, h / 720);
      ctx.translate((w - 1600 * scale) / 2, (h - 720 * scale) / 2);
      ctx.scale(scale, scale);
      const random = seeded(901);
      for (let i = 0; i < 190; i++) {
        ctx.fillStyle = `rgba(176,207,225,${0.12 + random() * 0.38})`;
        ctx.fillRect(random() * 1600, random() * 720, 1.5, 1.5);
      }
      ctx.lineWidth = 1 / scale;
      ctx.strokeStyle = '#152330';
      ctx.beginPath();
      for (let x = 0; x <= 1600; x += 100) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 720);
      }
      for (let y = 0; y <= 720; y += 100) {
        ctx.moveTo(0, y);
        ctx.lineTo(1600, y);
      }
      ctx.stroke();
      const dest = world.destination;
      ctx.strokeStyle = '#b4f574';
      ctx.setLineDash([6, 7]);
      ctx.beginPath();
      ctx.arc(dest.x, dest.y, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#b4f574';
      ctx.fillText('DESTINATION', dest.x - 110, dest.y - 55);
      for (const o of world.objects) {
        if (world.time < o.activeAt) continue;
        const unknown = o.kind === 'UNKNOWN';
        ctx.strokeStyle = unknown ? '#eeb575' : '#607585';
        ctx.fillStyle = unknown ? '#372d27' : '#24333e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(o.position.x, o.position.y, o.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(o.position.x, o.position.y, o.radius * 0.72, 0, Math.PI * 2);
        ctx.strokeStyle = unknown ? '#806148' : '#344958';
        ctx.stroke();
        if (unknown) {
          ctx.strokeStyle = '#eeb57566';
          ctx.beginPath();
          ctx.arc(
            o.position.x,
            o.position.y,
            o.radius + 12 + ((world.time * 12) % 30),
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
        ctx.fillStyle = unknown ? '#efb97b' : '#7994a4';
        ctx.font = '16px monospace';
        ctx.fillText(
          unknown ? 'UNKNOWN / SIGNAL' : o.id.toUpperCase(),
          o.position.x - o.radius,
          o.position.y - o.radius - 17,
        );
      }
      const fleetColors = ['#b4f574', '#7fc7ff', '#f3bb77', '#d6a3ff', '#78e1ca', '#ff9fba', '#e6df80', '#a7baff'];
      for (const [index, d] of Object.values(world.agents).entries()) {
        if (d.health <= 0 || d.battery <= 0) continue;
        const color = fleetColors[index % fleetColors.length];
        if (sensors) {
          ctx.strokeStyle = '#a7ef7422';
          ctx.fillStyle = '#a7ef7405';
          ctx.beginPath();
          ctx.arc(d.position.x, d.position.y, 340, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([4, 9]);
          for (const o of world.objects)
            if (
              o.activeAt <= world.time &&
              Math.hypot(
                o.position.x - d.position.x,
                o.position.y - d.position.y,
              ) < 340
            ) {
              ctx.strokeStyle =
                o.kind === 'UNKNOWN' ? '#eeb57555' : '#9ee97c33';
              ctx.beginPath();
              ctx.moveTo(d.position.x, d.position.y);
              ctx.lineTo(o.position.x, o.position.y);
              ctx.stroke();
            }
          ctx.setLineDash([]);
        }
        if (showTrails) {
          ctx.strokeStyle = `${color}aa`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          d.trail.forEach((p, i) =>
            i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
          );
          ctx.stroke();
        }
        const px = d.position.x,
          py = d.position.y,
          destDistance = Math.hypot(dest.x - px, dest.y - py),
          reach = Math.min(320, destDistance);
        if (world.time > 0 && reach > 40) {
          let turn =
            Math.atan2(dest.y - py, dest.x - px) - d.heading;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          turn = Math.max(-1.2, Math.min(1.2, turn));
          const endAngle = d.heading + turn * 0.7,
            midAngle = d.heading + turn * 0.25,
            p0 = {
              x: px + Math.cos(d.heading) * 22,
              y: py + Math.sin(d.heading) * 22,
            },
            p1 = {
              x: px + Math.cos(midAngle) * reach * 0.55,
              y: py + Math.sin(midAngle) * reach * 0.55,
            },
            p2 = {
              x: px + Math.cos(endAngle) * reach,
              y: py + Math.sin(endAngle) * reach,
            };
          const intent = ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);
          intent.addColorStop(0, 'rgba(127,199,255,0.5)');
          intent.addColorStop(0.5, 'rgba(127,199,255,0.24)');
          intent.addColorStop(1, 'rgba(127,199,255,0)');
          ctx.save();
          ctx.lineCap = 'round';
          ctx.shadowColor = '#7fc7ff';
          ctx.shadowBlur = 10;
          ctx.strokeStyle = intent;
          ctx.lineWidth = 3;
          ctx.beginPath();
          const steps = 28;
          for (let i = 0; i <= steps; i++) {
            const t = i / steps,
              mt = 1 - t;
            const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
              y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          }
          ctx.stroke();
          ctx.restore();
        }
        ctx.save();
        ctx.translate(d.position.x, d.position.y);
        ctx.rotate(d.heading);
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(21, 0);
        ctx.lineTo(-14, -12);
        ctx.lineTo(-7, 0);
        ctx.lineTo(-14, 12);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.font = '12px monospace';
        ctx.fillStyle = color;
        ctx.fillText(d.id.toUpperCase(), d.position.x - 14, d.position.y + 26);
      }
      frame = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(frame);
  }, [world, sensors, showTrails]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Live tactical map: drone, sensor range, obstacles and trajectory"
    />
  );
}
