import { formatCurrency, formatNumber, getOrdinalColor, getOrdinalInk } from '../../utils/formatters';

/*
 * Funnel stages are ORDERED, so they take the single-hue ordinal ramp rather
 * than categorical hues. Eight distinct hues across a funnel implied the stages
 * were unrelated identities, and the palette was indexed with a modulo, so a
 * seventh stage silently reused the colour of the first.
 */

interface FunnelStage {
  stage: string;
  value: number;
  count: number;
  conversionRate?: number;
}

interface FunnelChartProps {
  data: FunnelStage[];
  height?: number;
  formatValue?: 'currency' | 'number';
}

export function FunnelChart({
  data,
  formatValue = 'currency',
}: FunnelChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value));
  const totalValue = data.reduce((sum, d) => sum + d.value, 0);

  const formatDisplayValue = (value: number) => {
    return formatValue === 'currency' ? formatCurrency(value, true) : formatNumber(value, true);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Funnel stages - flex to fill available space */}
      <div className="flex-1 flex flex-col justify-between min-h-0">
        {data.map((stage, index) => {
          const widthPercent = (stage.value / maxValue) * 100;
          const pipelinePercent = totalValue > 0 ? ((stage.value / totalValue) * 100).toFixed(0) : 0;

          return (
            <div key={stage.stage} className="group flex-1 flex flex-col justify-center min-h-0">
              {/* Stats Row */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: getOrdinalColor(index, data.length) }}
                  />
                  <span className="text-xs font-medium text-gray-300">
                    {stage.stage}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <span className="text-xs font-semibold text-white tabular-nums">
                    {formatDisplayValue(stage.value)}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {stage.count.toLocaleString()} deals
                  </span>
                </div>
              </div>

              {/* Bar, with the share label inside it.
                *
                * Inside rather than after the bar end: the first stage is the
                * full width of the track, so a label past its end falls off the
                * card.
                *
                * The ink is paired to the ramp step rather than fixed white.
                * The ramp runs light to dark, and white measures 1.3:1 on the
                * palest step, so a single white label is invisible at the top
                * of the funnel however well it reads at the bottom. Each
                * pairing clears 4.5:1. */}
              <div className="relative h-6 bg-gray-800 rounded overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full rounded transition-all duration-500 ease-out group-hover:opacity-90 flex items-center"
                  style={{
                    width: `${Math.max(widthPercent, 8)}%`,
                    backgroundColor: getOrdinalColor(index, data.length),
                  }}
                >
                  <span
                    className="ml-2 text-xs font-semibold tabular-nums"
                    style={{ color: getOrdinalInk(index, data.length) }}
                  >
                    {pipelinePercent}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
