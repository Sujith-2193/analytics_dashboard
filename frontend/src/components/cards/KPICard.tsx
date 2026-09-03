import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency, formatNumber, formatPercent } from '../../utils/formatters';

interface KPICardProps {
  label: string;
  /**
   * The measurement. `null` means the API had nothing to report, which is not
   * the same as zero, and renders as an em-dash.
   *
   * Pages used to paper over a missing value with a literal placeholder
   * (`overview?.total || 500`, `avgCycleTime || 42`). A card claiming 500
   * customers because the request returned nothing is worse than a card
   * admitting it does not know.
   */
  value: number | null;
  previousValue?: number;
  change?: number;
  /**
   * Percentage change against the prior period.
   *
   * `null` is meaningful and distinct from a zero: it means the API had no
   * prior observation to compare against, so no delta exists. Several
   * forecasting KPIs return null for exactly this reason rather than inventing
   * a number. Both null and undefined suppress the badge entirely.
   */
  changePercent?: number | null;
  format?: 'currency' | 'number' | 'percent';
  icon?: React.ReactNode;
  className?: string;
  loading?: boolean;
}

export function KPICard({
  label,
  value,
  previousValue: _previousValue,
  change: _change,
  changePercent,
  format = 'number',
  icon,
  className,
  loading = false,
}: KPICardProps) {
  const formattedValue = (() => {
    if (value == null) return '—';
    switch (format) {
      case 'currency':
        return formatCurrency(value, true);
      case 'percent':
        return `${value.toFixed(1)}%`;
      default:
        return formatNumber(value, true);
    }
  })();

  // Loose inequality on purpose: catches null and undefined together. Using
  // `!== undefined` here rendered a "+0.0%" badge whenever the API sent null.
  const hasChange = changePercent != null;

  const trend = hasChange
    ? changePercent > 0
      ? 'up'
      : changePercent < 0
        ? 'down'
        : 'neutral'
    : 'neutral';

  const TrendIcon = trend === 'up'
    ? TrendingUp
    : trend === 'down'
      ? TrendingDown
      : Minus;

  const trendColor = trend === 'up'
    ? 'text-success'
    : trend === 'down'
      ? 'text-danger'
      : 'text-gray-400';

  const trendBg = trend === 'up'
    ? 'bg-success/10'
    : trend === 'down'
      ? 'bg-danger/10'
      : 'bg-gray-800';

  if (loading) {
    return (
      <div
        className={clsx(
          'rounded-lg border border-black/10 bg-white/80 px-3 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.04]',
          className
        )}
      >
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 flex-shrink-0 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
          <div className="flex-1 min-w-0">
            <div className="mb-1 h-3 w-16 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
            <div className="h-5 w-20 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
          </div>
          <div className="h-4 w-12 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'surface-card rounded-lg px-3 py-2 card-hover',
        className
      )}
    >
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex-shrink-0 rounded-md bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-300">
            {icon}
          </div>
        )}
        <div className="flex-1">
          <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
          <p className="text-lg font-bold tabular-nums text-zinc-950 dark:text-white">
            {formattedValue}
          </p>
        </div>
        {hasChange && (
          <span
            className={clsx(
              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0',
              trendBg,
              trendColor
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {formatPercent(Math.abs(changePercent))}
          </span>
        )}
      </div>
    </div>
  );
}

interface KPIGridProps {
  children: React.ReactNode;
  className?: string;
}

export function KPIGrid({ children, className }: KPIGridProps) {
  return (
    <div
      className={clsx(
        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2',
        className
      )}
    >
      {children}
    </div>
  );
}
