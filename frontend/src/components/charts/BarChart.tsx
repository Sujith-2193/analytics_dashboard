import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import { currencyAxisFormatter, formatCurrency, numberAxisFormatter } from '../../utils/formatters';
import { CHART_CHROME, getChartColor, getOrdinalColor } from '../../utils/formatters';

interface BarChartProps<T> {
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
  horizontal?: boolean;
  stacked?: boolean;
  /**
   * Set only when the bars are ORDERED bins - value ranges, tiers, age bands.
   * Renders the single-hue ordinal ramp.
   *
   * Leave unset for nominal categories (regions, product categories, segments).
   * One series gets one colour there: giving each bar its own hue would
   * double-encode magnitude that bar length already carries, burn the only
   * free channel to say nothing new, and cycle hues past the eighth slot.
   */
  ordinal?: boolean;
  angledLabels?: boolean;
  formatXAsDate?: boolean;
}

function formatDateLabel(value: string): string {
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function BarChart<T extends Record<string, unknown>>({
  data,
  xKey,
  yKeys,
  labels = {},
  height = '100%',
  showGrid = true,
  colors,
  showLegend,
  formatY = 'currency',
  horizontal = false,
  stacked = false,
  ordinal = false,
  angledLabels = false,
  formatXAsDate = false,
}: BarChartProps<T>) {
  /** Override wins for the slots it covers; the palette fills the rest. */
  const seriesColor = (i: number) => colors?.[i] ?? getChartColor(i);

  /*
   * A legend is always present for two or more series, so identity never rests
   * on colour alone. It defaults off for a single series because the card title
   * already names it and a one-entry legend is chrome with no content. An
   * explicit prop still wins either way.
   */
  const legendVisible = showLegend ?? yKeys.length >= 2;

  const formatAxis = formatY === 'currency' ? currencyAxisFormatter : numberAxisFormatter;
  const formatTooltip = formatY === 'currency' ? formatCurrency : (v: number) => v.toLocaleString();

  const ChartComponent = horizontal ? (
    <RechartsBarChart
      data={data}
      layout="vertical"
      margin={{ top: 0, right: 0, left: 50, bottom: 0 }}
    >
      {showGrid && (
        <CartesianGrid stroke={CHART_CHROME.grid} strokeWidth={1} horizontal={false} />
      )}

      <XAxis
        type="number"
        stroke={CHART_CHROME.mutedInk}
        fontSize={12}
        tickLine={false}
        axisLine={false}
        tickFormatter={formatAxis}
      />

      <YAxis
        type="category"
        dataKey={String(xKey)}
        stroke={CHART_CHROME.mutedInk}
        fontSize={12}
        tickLine={false}
        axisLine={false}
        width={70}
      />

      <Tooltip
        contentStyle={{
          backgroundColor: '#1F2937',
          border: '1px solid #374151',
          borderRadius: '8px',
          fontSize: '12px',
        }}
        labelStyle={{ color: '#9CA3AF' }}
        cursor={false}
        formatter={(value, name) => [
          formatTooltip(Number(value) || 0),
          labels[String(name)] || String(name),
        ]}
      />

      {legendVisible && (
        <Legend
          wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
          formatter={(value) => labels[value] || value}
        />
      )}

      {yKeys.map((key, index) => (
        <Bar
          key={String(key)}
          dataKey={String(key)}
          stackId={stacked ? 'stack' : undefined}
          fill={seriesColor(index)}
          radius={[0, 4, 4, 0]}
        >
          {ordinal &&
            data.map((_, i) => (
              <Cell key={`cell-${i}`} fill={getOrdinalColor(i, data.length)} />
            ))}
        </Bar>
      ))}
    </RechartsBarChart>
  ) : (
    <RechartsBarChart
      data={data}
      margin={{ top: 0, right: 0, left: 0, bottom: angledLabels ? 60 : 0 }}
    >
      {showGrid && (
        <CartesianGrid stroke={CHART_CHROME.grid} strokeWidth={1} vertical={false} />
      )}

      <XAxis
        dataKey={String(xKey)}
        stroke={CHART_CHROME.mutedInk}
        fontSize={10}
        tickLine={false}
        axisLine={false}
        angle={angledLabels ? -45 : 0}
        textAnchor={angledLabels ? 'end' : 'middle'}
        height={angledLabels ? 80 : 30}
        interval="preserveStartEnd"
        tickFormatter={formatXAsDate ? formatDateLabel : undefined}
      />

      <YAxis
        stroke={CHART_CHROME.mutedInk}
        fontSize={12}
        tickLine={false}
        axisLine={false}
        tickFormatter={formatAxis}
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
        cursor={false}
        formatter={(value, name) => [
          formatTooltip(Number(value) || 0),
          labels[String(name)] || String(name),
        ]}
      />

      {legendVisible && (
        <Legend
          wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
          formatter={(value) => labels[value] || value}
        />
      )}

      {yKeys.map((key, index) => (
        <Bar
          key={String(key)}
          dataKey={String(key)}
          stackId={stacked ? 'stack' : undefined}
          fill={seriesColor(index)}
          radius={[4, 4, 0, 0]}
        >
          {ordinal &&
            data.map((_, i) => (
              <Cell key={`cell-${i}`} fill={getOrdinalColor(i, data.length)} />
            ))}
        </Bar>
      ))}
    </RechartsBarChart>
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      {ChartComponent}
    </ResponsiveContainer>
  );
}
