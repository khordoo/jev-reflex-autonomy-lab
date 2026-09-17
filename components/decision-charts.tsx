'use client';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer } from '@/components/ui/chart';
import { confidenceSeries, plannerSeries } from '@/lib/reflex/chart-data';
import type { PlanningEvent, TelemetryEvent } from '@/lib/reflex/types';

export function DecisionCharts({
  events,
  planningEvents,
  failures,
  time,
  threshold,
  agentId,
  decisionMode,
  plannerMode,
}: {
  events: TelemetryEvent[];
  planningEvents: PlanningEvent[];
  failures: { simulationTime: number; agentId: string }[];
  time: number;
  threshold: number;
  agentId: string;
  decisionMode: 'mock' | 'live';
  plannerMode: 'mock' | 'live';
}) {
  const confidence = confidenceSeries(
    events,
    failures,
    agentId,
    planningEvents,
    time,
  );
  const activity = plannerSeries(planningEvents, time, agentId);
  const plans = planningEvents.filter((e) => e.agentId === agentId);
  const end = Math.max(30, Math.ceil(time / 10) * 10);
  const domain: [number, number] = [0, end];
  const unknownAt = events.find(
    (e) =>
      e.agentId === agentId &&
      e.observation.detections.some((d) => d.classification === 'UNKNOWN'),
  )?.simulationTime;
  const recent = events.at(-1);
  const latestPlan = plans.at(-1);
  const tooltipStyle = {
    background: '#101b26',
    border: '1px solid #3b5061',
    color: '#dce7ee',
    borderRadius: 6,
    fontSize: 12,
  };
  return (
    <div className="decision-charts">
      <section
        className="signal-chart"
        aria-label="System 1 confidence history"
      >
        <div className="chart-heading">
          <div>
            <h3>
              <span className="chart-dot lime-bg" />
              System 1 · confidence
            </h3>
            <p>
              {decisionMode === 'mock'
                ? 'Synthetic mock values'
                : 'Confidence returned by Jev'}{' '}
              · {events.length} decisions
            </p>
          </div>
          <strong className="lime">
            {recent ? `${Math.round(recent.decision.confidence * 100)}%` : '—'}
          </strong>
        </div>
        <ChartContainer
          config={{
            system1Confidence: { label: 'Jev · solo', color: '#b7f580' },
            planningConfidence: {
              label: 'Jev · System 2 planning',
              color: '#bba7f3',
            },
            threshold: { label: 'Escalation gate', color: '#efb97b' },
          }}
          className="signal-chart-canvas"
          aria-label="Confidence from zero to one hundred percent over mission time"
        >
          <ComposedChart
            data={confidence}
            syncId={`mission-${agentId}`}
            syncMethod="value"
            margin={{ top: 24, right: 18, bottom: 4, left: 0 }}
            accessibilityLayer
          >
            <CartesianGrid
              vertical={false}
              stroke="#233442"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="time"
              type="number"
              domain={domain}
              tickFormatter={(n) => `${n}s`}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tickFormatter={(n) => `${n}%`}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(v) => `Mission ${Number(v).toFixed(1)}s`}
              formatter={(v, name) => [
                v == null ? 'No response' : `${Number(v).toFixed(1)}%`,
                name === 'threshold'
                  ? 'Gate at decision'
                  : name === 'planningConfidence'
                    ? 'Jev confidence · System 2 planning'
                    : 'Jev confidence · solo',
              ]}
            />
            {!confidence.length && (
              <ReferenceLine
                y={threshold}
                stroke="#efb97b"
                strokeDasharray="4 5"
              />
            )}
            {unknownAt !== undefined && (
              <ReferenceLine
                x={unknownAt}
                stroke="#607688"
                strokeDasharray="3 5"
                label={{
                  value: 'Unknown detected',
                  fill: '#99adbc',
                  fontSize: 12,
                  position: 'insideTopRight',
                }}
              />
            )}
            {plans.map((p) => (
              <ReferenceLine
                key={p.id}
                x={p.startedAt}
                stroke="#bba7f3"
                strokeDasharray="3 5"
              />
            ))}
            <Area
              type="linear"
              dataKey="system1Confidence"
              stroke="none"
              fill="#b7f580"
              fillOpacity={0.08}
              isAnimationActive={false}
              connectNulls={false}
              tooltipType="none"
            />
            <Area
              type="linear"
              dataKey="planningConfidence"
              stroke="none"
              fill="#bba7f3"
              fillOpacity={0.12}
              isAnimationActive={false}
              connectNulls={false}
              tooltipType="none"
            />
            <Line
              type="stepAfter"
              dataKey="threshold"
              stroke="#efb97b"
              strokeDasharray="4 5"
              strokeWidth={1}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              type="linear"
              dataKey="system1Confidence"
              stroke="#b7f580"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              type="linear"
              dataKey="planningConfidence"
              stroke="#bba7f3"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls={false}
            />
            {plans.map((p) => (
              <ReferenceDot
                key={p.id}
                x={p.startedAt}
                y={p.triggerConfidence * 100}
                r={4}
                fill="#bba7f3"
                stroke="#111923"
              />
            ))}
          </ComposedChart>
        </ChartContainer>
        <div className="chart-legend">
          <span className="lime">━ Jev · solo reflex loop</span>
          <span className="purple">━ Jev while System 2 plans</span>
          <span className="amber">┄ Escalation gate</span>
        </div>
      </section>
      <section
        className="signal-chart"
        aria-label="System 2 planning activity history"
      >
        <div className="chart-heading">
          <div>
            <h3>
              <span className="chart-dot purple-bg" />
              System 2 · planning activity
            </h3>
            <p>
              {plannerMode === 'mock' ? 'Mock planner' : 'OpenRouter planner'} ·{' '}
              {plans.length} requests
            </p>
          </div>
          <strong className="purple small-value">
            {latestPlan?.status === 'planning'
              ? 'Thinking'
              : latestPlan?.status === 'failed'
                ? 'Failed'
                : latestPlan
                  ? `Strategy r${latestPlan.strategyRevision}`
                  : 'Standby'}
          </strong>
        </div>
        <ChartContainer
          config={{ active: { label: 'Planner active', color: '#bba7f3' } }}
          className="signal-chart-canvas planner-chart"
          aria-label="Actual planner request intervals aligned to confidence history"
        >
          <AreaChart
            data={activity}
            syncId={`mission-${agentId}`}
            syncMethod="value"
            margin={{ top: 26, right: 18, bottom: 4, left: 0 }}
            accessibilityLayer
          >
            <CartesianGrid
              vertical={false}
              stroke="#233442"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="time"
              type="number"
              domain={domain}
              tickFormatter={(n) => `${n}s`}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
            />
            <YAxis
              domain={[0, 1.15]}
              ticks={[0, 1]}
              tickFormatter={(n) => (n ? 'On' : 'Off')}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(v) => `Mission ${Number(v).toFixed(1)}s`}
              formatter={(v) => [
                Number(v) ? 'Planning' : 'Standby',
                'System 2',
              ]}
            />
            <Area
              type="stepAfter"
              dataKey="active"
              stroke="#bba7f3"
              strokeWidth={2}
              fill="#bba7f3"
              fillOpacity={0.18}
              dot={false}
              isAnimationActive={false}
            />
            {plans.map((p) => (
              <ReferenceLine
                key={p.id}
                x={p.startedAt}
                stroke="#bba7f3"
                strokeDasharray="3 5"
              />
            ))}
            {plans
              .filter((p) => p.endedAt !== undefined)
              .map((p) => (
                <ReferenceDot
                  key={p.id}
                  x={p.endedAt!}
                  y={0}
                  r={4}
                  fill={p.status === 'failed' ? '#ff9286' : '#bba7f3'}
                  stroke="#111923"
                  label={{
                    value:
                      p.status === 'failed'
                        ? 'Failed'
                        : `Strategy r${p.strategyRevision}`,
                    fill: p.status === 'failed' ? '#ff9286' : '#bba7f3',
                    position: 'top',
                    fontSize: 12,
                  }}
                />
              ))}
          </AreaChart>
        </ChartContainer>
        <div className="chart-legend">
          <span>Shared axis: mission time</span>
          <span>
            {latestPlan?.latencyMs !== undefined
              ? `Last request: ${(latestPlan.latencyMs / 1000).toFixed(2)}s wall time`
              : 'Requests begin below the gate or on a newly detected unknown.'}
          </span>
        </div>
      </section>
      {!events.length && (
        <p className="chart-empty">
          Launch the mission to watch confidence and planning unfold over time.
        </p>
      )}
    </div>
  );
}
