import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Loading } from '../common/Loading';
import { ErrorMessage } from '../common/ErrorBoundary';
import { useContainerSize } from '../../hooks/useContainerSize';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  actions?: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function ChartCard({
  title,
  subtitle,
  children,
  loading = false,
  error = null,
  onRetry,
  actions,
  className,
  noPadding = false,
}: ChartCardProps) {
  const [containerRef, containerSize] = useContainerSize<HTMLDivElement>();

  return (
    <div
      className={clsx(
        'surface-card flex h-full flex-col overflow-hidden rounded-lg',
        className
      )}
    >
      {/* Header - fixed height */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-black/10 px-3 py-2 dark:border-white/10">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">{title}</h3>
          {subtitle && (
            <p className="text-xs text-zinc-500">· {subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>

      {/* Content - fills remaining space */}
      <div
        ref={containerRef}
        className={clsx('flex-1 min-h-0', !noPadding && 'p-2')}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loading text="Loading..." />
          </div>
        ) : error ? (
          <ErrorMessage
            message={error.message}
            onRetry={onRetry}
          />
        ) : containerSize.height > 0 ? (
          <div style={{ width: '100%', height: containerSize.height - (noPadding ? 0 : 16) }}>
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    label: string;
  };
  icon?: ReactNode;
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle: _subtitle,
  trend,
  icon,
  className,
}: StatCardProps) {
  const trendColor = trend
    ? trend.value > 0
      ? 'text-success'
      : trend.value < 0
        ? 'text-danger'
        : 'text-gray-400'
    : 'text-gray-400';

  return (
    <div
      className={clsx(
        'surface-card rounded-lg px-3 py-2',
        className
      )}
    >
      <div className="flex items-center gap-2">
        {icon && (
          <div className="flex-shrink-0 rounded-md bg-zinc-100 p-1.5 text-zinc-500 dark:bg-white/10 dark:text-zinc-300">{icon}</div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{title}</p>
          <p className="text-lg font-bold tabular-nums text-zinc-950 dark:text-white">{value}</p>
        </div>
        {trend && (
          <span className={clsx('text-xs font-medium flex-shrink-0', trendColor)}>
            {trend.value > 0 ? '↑' : trend.value < 0 ? '↓' : '→'}{' '}
            {Math.abs(trend.value).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
