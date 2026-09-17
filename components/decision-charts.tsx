'use client';
import { memo } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer } from '@/components/ui/chart';
import {
  confidenceSeries,
  latencySeries,
} from '@/lib/reflex/chart-data';
import type { PlanningEvent, TelemetryEvent } from '@/lib/reflex/types';

export const DecisionCharts = memo(function DecisionCharts({
  events,
  planningEvents,
  failures,
  time,
  agentId,
  decisionMode,
  plannerMode,
}: {
  events: TelemetryEvent[];
  planningEvents: PlanningEvent[];
  failures: {
    simulationTime: number;
    agentId: string;
    latencyMs?: number;
  }[];
  time: number;
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
  const latency = latencySeries(events, planningEvents, agentId, failures);
  const plans = planningEvents.filter((e) => e.agentId === agentId);
  const advisoryResponses = plans
    .filter((plan) => plan.endedAt !== undefined)
    .map((plan) => ({
      time: plan.endedAt!,
      received: plan.status === 'completed' ? 1 : 0,
      failed: plan.status === 'failed' ? 1 : 0,
    }));
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
  const formatLatency = (value: number) =>
    value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;
  const jevLatencies = events
    .filter((event) => event.agentId === agentId)
    .map((event) => event.latencyMs)
    .sort((a, b) => a - b);
  const medianJevLatency = jevLatencies.length
    ? jevLatencies[Math.floor(jevLatencies.length / 2)]
    : undefined;
  const maxLatency = Math.max(
    1,
    ...latency.flatMap((point) => [
      point.system1LatencyMs ?? 0,
      point.system2LatencyMs ?? 0,
      point.failureLatencyMs ?? 0,
    ]),
  );
  const latencyCeiling =
    maxLatency <= 1000 ? 1000 : Math.ceil((maxLatency * 1.15) / 5000) * 5000;
  const latencyTicks = [0, 0.25, 0.5, 0.75, 1].map(
    (part) => part * latencyCeiling,
  );
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
              label: 'Jev using System 2 guidance',
              color: '#bba7f3',
            },
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
                name === 'planningConfidence'
                    ? 'Jev confidence · using System 2 guidance'
                    : 'Jev confidence · solo',
              ]}
            />
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
              dot={{ r: 3, fill: '#bba7f3', strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ChartContainer>
        <div className="chart-legend">
          <span className="lime">━ Jev · solo reflex loop</span>
          <span className="purple">● Jev using System 2 guidance</span>
        </div>
      </section>
      <section
        className="signal-chart latency-chart"
        aria-label="Provider response latency history"
      >
        <div className="chart-heading">
          <div>
            <h3>
              <span className="chart-dot lime-bg" />
              Response latency gap
            </h3>
            <p>Wall-clock response time · linear scale</p>
          </div>
          <strong className="purple small-value">
            {latestPlan?.latencyMs && medianJevLatency
              ? `${Math.round(latestPlan.latencyMs / medianJevLatency)}× slower`
              : recent
                ? formatLatency(recent.latencyMs)
                : '—'}
          </strong>
        </div>
        <ChartContainer
          config={{
            system1LatencyMs: { label: 'Jev', color: '#b7f580' },
            system2LatencyMs: { label: 'GLM 5.3', color: '#bba7f3' },
            failureLatencyMs: { label: 'Provider failure', color: '#ff9286' },
          }}
          className="signal-chart-canvas"
          aria-label="System 1 and System 2 response latency on a linear scale"
        >
          <ComposedChart
            data={latency}
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
              domain={[0, latencyCeiling]}
              ticks={latencyTicks}
              tickFormatter={(n) => formatLatency(Number(n))}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(v) => `Mission ${Number(v).toFixed(1)}s`}
              formatter={(v, name) => [
                formatLatency(Number(v)),
                name === 'system2LatencyMs'
                  ? 'GLM 5.3'
                  : name === 'failureLatencyMs'
                    ? 'Provider failure'
                    : 'Jev',
              ]}
            />
            <Line
              type="linear"
              dataKey="system1LatencyMs"
              stroke="#b7f580"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="linear"
              dataKey="system2LatencyMs"
              stroke="none"
              dot={{ r: 5, fill: '#bba7f3', stroke: '#111923' }}
              activeDot={{ r: 6, fill: '#bba7f3' }}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              type="linear"
              dataKey="failureLatencyMs"
              stroke="none"
              dot={{ r: 5, fill: '#ff9286', stroke: '#111923' }}
              activeDot={{ r: 6, fill: '#ff9286' }}
              isAnimationActive={false}
              connectNulls={false}
            />
            {plans.map((plan) => (
              <ReferenceLine
                key={plan.id}
                segment={
                  plan.latencyMs === undefined
                    ? undefined
                    : [
                        { x: plan.startedAt, y: 0 },
                        { x: plan.startedAt, y: plan.latencyMs },
                      ]
                }
                x={plan.latencyMs === undefined ? plan.startedAt : undefined}
                stroke="#bba7f3"
                strokeDasharray="3 5"
              />
            ))}
          </ComposedChart>
        </ChartContainer>
        <div className="chart-legend">
          <span className="lime">━ Jev decision latency</span>
          <span className="purple">┃ GLM 5.3 strategy latency</span>
          <span className="danger">● Provider failure</span>
          <span>Linear scale shows the full latency gap</span>
        </div>
      </section>
      <section
        className="signal-chart planner-activity-chart"
        aria-label="System 2 advisory response history"
      >
        <div className="chart-heading">
          <div>
            <h3>
              <span className="chart-dot purple-bg" />
              System 2 · advisory responses
            </h3>
            <p>
              {plannerMode === 'mock' ? 'Mock planner' : 'OpenRouter planner'} ·{' '}
              {advisoryResponses.length} responses from {plans.length} requests
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
          config={{
            received: { label: 'Advice received', color: '#bba7f3' },
            failed: { label: 'Request failed', color: '#ff9286' },
          }}
          className="signal-chart-canvas planner-chart"
          aria-label="System 2 responses aligned to mission time"
        >
          <BarChart
            data={advisoryResponses}
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
              domain={[0, 1]}
              ticks={[0, 1]}
              tickFormatter={(n) => (n ? 'Received' : '')}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(v) => `Mission ${Number(v).toFixed(1)}s`}
              formatter={(value, name) => [
                Number(value)
                  ? name === 'failed'
                    ? 'Failed'
                    : 'Advice received'
                  : '',
                name === 'failed' ? 'System 2 failure' : 'System 2 advice',
              ]}
            />
            <Bar
              dataKey="received"
              fill="#bba7f3"
              barSize={10}
              isAnimationActive={false}
            />
            <Bar
              dataKey="failed"
              fill="#ff9286"
              barSize={10}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
        <div className="chart-legend">
          <span className="purple">▮ Advice received</span>
          <span className="danger">▮ Request failed</span>
          <span>Bars mark response arrival · shared mission-time axis</span>
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
});
