import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { currencyAxisFormatter, formatCurrency, formatDateShort } from '../../utils/formatters';
import { CHART_CHROME, getChartColor } from '../../utils/formatters';

interface AreaChartProps<T> {
  data: T[];
  xKey: keyof T;
  yKeys: (keyof T)[];
  labels?: Record<string, string>;
  height?: number | '100%';
  showGrid?: boolean;
  /**
   * Optional per-series colour override, in slot order.
   *
   * Entries past the end fall through to the standard palette slot for that
   * index. There is no modulo: cycling a short override across many series
   * repaints identities the reader has already learned.
   */
  colors?: string[];
  showLegend?: boolean;
  formatY?: 'currency' | 'number' | 'percent';
  stacked?: boolean;
  gradient?: boolean;
  dashedKeys?: (keyof T)[];
  /**
   * Draw an uncertainty band between two keys, behind the series lines.
   *
   * Points where either bound is null are skipped, so a band can cover only the
   * forecast portion of a series while the measured history has none. Measured
   * values carry no uncertainty to draw.
   */
  band?: { lower: keyof T; upper: keyof T; label?: string };
}

export function AreaChart<T extends Record<string, unknown>>({
  data,
  xKey,
  yKeys,
  labels = {},
  height = '100%',
  showGrid = true,
  colors,
  showLegend,
  formatY = 'currency',
  stacked = false,
  gradient = true,
  dashedKeys = [],
  band,
}: AreaChartProps<T>) {
  /** Override wins for the slots it covers; the palette fills the rest. */
  const seriesColor = (i: number) => colors?.[i] ?? getChartColor(i);

  /*
   * A legend is always present for two or more series, so identity never rests
   * on colour alone. It defaults off for a single series because the card title
   * already names it and a one-entry legend is chrome with no content. An
   * explicit prop still wins either way.
   */
  const legendVisible = showLegend ?? yKeys.length >= 2;

  const formatYAxis = formatY === 'currency' ? currencyAxisFormatter : (v: number) => v.toLocaleString();
  const formatTooltip = formatY === 'currency' ? formatCurrency : (v: number) => v.toLocaleString();

  // Calculate interval for X-axis labels to prevent overlap
  // Show fewer labels when there are many data points
  const xAxisInterval = data.length > 20 ? Math.ceil(data.length / 10) - 1 : 0;

  return (
    <ResponsiveContainer width="100%" height={height}>
      {/* Right margin so the final x-axis tick is not clipped by the plot edge.
        * With zero margin the last label rendered as "Ja" instead of "Jan 1". */}
      <RechartsAreaChart data={data} margin={{ top: 0, right: 14, left: 0, bottom: 0 }}>
        <defs>
          {yKeys.map((key, index) => (
            <linearGradient
              key={String(key)}
              id={`gradient-${String(key)}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="5%"
                stopColor={seriesColor(index)}
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor={seriesColor(index)}
                stopOpacity={0}
              />
            </linearGradient>
          ))}
        </defs>

        {showGrid && (
          <CartesianGrid stroke={CHART_CHROME.grid} strokeWidth={1} vertical={false} />
        )}

        <XAxis
          dataKey={String(xKey)}
          stroke={CHART_CHROME.mutedInk}
          fontSize={10}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatDateShort(value)}
          interval={xAxisInterval}
        />

        <YAxis
          stroke={CHART_CHROME.mutedInk}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatYAxis}
          width={60}
        />

        <Tooltip
          contentStyle={{
            backgroundColor: '#1F2937',
            border: '1px solid #374151',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: '#9CA3AF' }}
          formatter={(value, name) => [
            formatTooltip(Number(value) || 0),
            labels[String(name)] || String(name),
          ]}
          labelFormatter={(label) => formatDateShort(String(label))}
        />

        {legendVisible && (
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
            formatter={(value) => labels[value] || value}
          />
        )}

        {/* Uncertainty band, drawn first so it sits behind the lines.
          *
          * A range Area: the array dataKey gives Recharts a low and a high per
          * point. Deliberately recessive - a soft fill, no stroke, no dots. The
          * band is context for the forecast, not a series of its own, so it
          * carries no legend entry and never competes with the data. */}
        {band && (
          <Area
            type="monotone"
            dataKey={(row: T) => {
              const lo = row[band.lower];
              const hi = row[band.upper];
              return lo == null || hi == null ? null : [Number(lo), Number(hi)];
            }}
            name={band.label ?? 'Confidence range'}
            stroke="none"
            fill={seriesColor(0)}
            fillOpacity={0.14}
            activeDot={false}
            dot={false}
            legendType="none"
            isAnimationActive={false}
            connectNulls={false}
          />
        )}

        {yKeys.map((key, index) => (
          <Area
            key={String(key)}
            type="monotone"
            dataKey={String(key)}
            stackId={stacked ? 'stack' : undefined}
            stroke={seriesColor(index)}
            strokeWidth={2}
            strokeDasharray={dashedKeys.includes(key) ? '5 5' : undefined}
            /*
             * A dashed series is a projection, so it draws as a line only.
             *
             * Filling it was actively misleading in two ways. A filled area
             * reads as measured volume, which a forecast is not. And where a
             * backtest overlaps the actuals, two translucent fills stack into a
             * smear in which neither line can be read - which is exactly what
             * happened on the forecasting page.
             *
             * When a band is present nothing is filled. On a chart that runs
             * measured history into a forecast, filling the measured half
             * produced a solid block that fell off a cliff to the axis the
             * moment the actuals stopped, which read as the data breaking
             * rather than as history ending. The band is the fill; a second one
             * competes with it.
             */
            fill={
              dashedKeys.includes(key) || band
                ? 'none'
                : gradient
                  ? `url(#gradient-${String(key)})`
                  : seriesColor(index)
            }
            fillOpacity={dashedKeys.includes(key) || band ? 0 : gradient ? 1 : 0.1}
          />
        ))}
      </RechartsAreaChart>
    </ResponsiveContainer>
  );
}
