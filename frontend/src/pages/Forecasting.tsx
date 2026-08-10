import { TrendingUp, AlertCircle, BarChart3, Calendar } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { KPICard } from '../components/cards/KPICard';
import { ChartCard } from '../components/cards/ChartCard';
import { AreaChart } from '../components/charts/AreaChart';
import { BarChart } from '../components/charts/BarChart';
import { DonutChart } from '../components/charts/PieChart';
import { DataTable } from '../components/tables/DataTable';
import { formatCurrency } from '../utils/formatters';
import { useRevenueForecast, useChurnRisk, useSeasonality, useForecastingKpis, useModelPerformance, useRevenueAtRisk, useCustomerSegments } from '../hooks/useApi';
import { useFilters } from '../hooks/useFilters';

export function Forecasting() {
  const { filters } = useFilters();

  // Fetch real data from API - all data varies by selected date range
  const { data: revenueForecast, isLoading: forecastLoading } = useRevenueForecast(6);
  const { data: churnRiskData, isLoading: churnLoading } = useChurnRisk(17);
  const { data: seasonalityData, isLoading: seasonalityLoading } = useSeasonality();
  const { data: kpis, isLoading: kpisLoading } = useForecastingKpis();
  const { data: modelPerformance, isLoading: modelLoading } = useModelPerformance();
  const { data: revenueAtRisk, isLoading: riskLoading } = useRevenueAtRisk();
  const { data: customerSegments, isLoading: segmentsLoading } = useCustomerSegments();

  // Transform forecast data
  const forecastData = (revenueForecast || []).map(item => ({
    date: item.date,
    actual: item.actual,
    predicted: item.predicted,
    lowerBound: item.lowerBound,
    upperBound: item.upperBound,
  }));

  // Transform churn risk data
  const churnData = (churnRiskData || []).map(customer => ({
    id: customer.id,
    company: customer.company,
    segment: customer.segment,
    ltv: customer.lifetimeValue,
    riskScore: customer.riskScore,
    daysSinceActivity: customer.daysSinceActivity,
    recommendation: customer.recommendation,
  }));

  // Measured metrics only. This object used to fall back to a literal
  // {accuracy: 94.2, r2Score: 0.942, confidence: 95} whenever the request
  // failed, which is the same fabrication the backend was rebuilt to remove,
  // surviving in the frontend. A failed request now renders a dash.
  //
  // The tiles below deliberately show MAPE against the naive baseline rather
  // than R². R² on a five-month chronological holdout of a near-flat series is
  // negative here (-0.63) while MAPE is 3.58%, because R² measures against the
  // holdout's own mean and a flat window makes that mean hard to beat. Both are
  // real and both stay in /api/forecasting/model-performance; the pair that
  // actually tells you whether the model is worth running is error against the
  // baseline you would otherwise use.
  const revenueMetrics = modelPerformance?.revenue;
  const churnMetrics = modelPerformance?.churn;
  const pct = (v?: number) => (v == null ? '—' : `${v.toFixed(2)}%`);

  // Quarterly actual against quarterly forecast, aggregated from the same
  // series the chart above plots. A month counts as actual when it has one and
  // as projected otherwise, so the join month is never counted twice.
  //
  // Quarters the series only partly covers are dropped. This is the same rule
  // app/periods.py applies to months, and it was missing here: under a 90-day
  // window the series opened mid-quarter and ended one month into the next, so
  // the first bar showed two thirds of a quarter and the last showed one third,
  // and the chart read as revenue collapsing at both ends.
  //
  // The two series stack rather than sit side by side. A quarter is almost
  // always wholly historical or wholly forecast, so grouped bars left every
  // quarter but the crossover with one empty slot, which reads as missing data.
  const growthProjections = (() => {
    const buckets = new Map<
      string,
      { quarter: string; historical: number; projected: number; months: number }
    >();
    for (const row of revenueForecast || []) {
      const date = new Date(`${row.date}T00:00:00`);
      const key = `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
      const bucket = buckets.get(key) ?? { quarter: key, historical: 0, projected: 0, months: 0 };
      bucket.months += 1;
      if (row.actual != null) bucket.historical += row.actual;
      else if (row.predicted != null) bucket.projected += row.predicted;
      buckets.set(key, bucket);
    }
    return [...buckets.values()].filter((b) => b.months === 3);
  })();

  // Real revenue by segment for the selected window. Previously four invented
  // rows whose percentages the donut then computed, so the chart looked derived
  // when nothing underneath it was.
  const segmentForecast = (customerSegments || []).map((s) => ({
    segment: s.segment.replace(/(^|-)([a-z])/g, (_, sep, ch) => (sep ? ' ' : '') + ch.toUpperCase()),
    value: s.revenue,
  }));

  // No invented fallback: an empty series renders as an empty chart, which is
  // the honest signal that the request failed.
  const seasonalData = seasonalityData || [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Header
        title="Forecasting"
        subtitle={`${filters.dateRange.startDate} to ${filters.dateRange.endDate}`}
      />

      {/* Content area with fixed row heights */}
      <div className="flex-1 p-3 flex flex-col gap-2 min-h-0 overflow-hidden">
        {/* Row 1: KPIs - fixed height */}
        <div className="flex-shrink-0 grid grid-cols-4 gap-2">
          <KPICard
            label="Predicted Revenue (6mo)"
            value={kpis?.predictedRevenue ?? null}
            changePercent={kpis?.predictedChange ?? null}
            format="currency"
            icon={<TrendingUp className="h-4 w-4" />}
            loading={kpisLoading}
          />
          <KPICard
            label="At-Risk Customers"
            value={kpis?.atRiskCount ?? (churnData.length || null)}
            changePercent={kpis?.atRiskChange ?? null}
            format="number"
            icon={<AlertCircle className="h-4 w-4" />}
            loading={kpisLoading || churnLoading}
          />
          <KPICard
            label="Model Accuracy"
            value={kpis?.modelAccuracy ?? null}
            changePercent={kpis?.accuracyChange ?? null}
            format="percent"
            icon={<BarChart3 className="h-4 w-4" />}
            loading={kpisLoading}
          />
          <KPICard
            label="Forecast Period"
            value={kpis?.forecastPeriod ?? null}
            changePercent={kpis?.predictedChange ? kpis.predictedChange * 0.1 : 1.5}
            format="number"
            icon={<Calendar className="h-4 w-4" />}
          />
        </div>

        {/* Row 2: Revenue Forecast + Seasonality - 30% (matching dashboard) */}
        <div className="flex-[30] min-h-0 grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <ChartCard
              title="Revenue Forecast"
              subtitle="6-month ML prediction"
              loading={forecastLoading}
            >
              <div className="mb-2 flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5" style={{ backgroundColor: 'var(--color-chart-1)' }} />
                  <span className="text-gray-400">Actual</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5" style={{ backgroundImage: 'linear-gradient(to right, var(--color-chart-1) 50%, transparent 50%)', backgroundSize: '4px 2px' }} />
                  <span className="text-gray-400">Predicted</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-4 h-2.5 rounded-sm"
                    style={{ backgroundColor: 'var(--color-chart-1)', opacity: 0.14 }}
                  />
                  <span className="text-gray-400">Forecast range</span>
                </div>
              </div>
              <AreaChart
                data={forecastData.filter(d => d.actual != null || d.predicted != null)}
                xKey="date"
                yKeys={['actual', 'predicted']}
                labels={{ actual: 'Actual Revenue', predicted: 'Predicted Revenue' }}
                colors={['var(--color-chart-1)', 'var(--color-chart-1)']}
                showLegend={false}
                dashedKeys={['predicted']}
                band={{ lower: 'lowerBound', upper: 'upperBound', label: 'Forecast range' }}
              />
            </ChartCard>
          </div>

          <ChartCard
            title="Seasonal Index"
            subtitle="Monthly pattern"
            loading={seasonalityLoading}
          >
            <BarChart
              data={seasonalData}
              xKey="month"
              yKeys={['index']}
              labels={{ index: 'Index' }}
              formatY="number"
            />
          </ChartCard>
        </div>

        {/* Row 3: Growth Projections + Model Performance + Segment Forecast - 30% */}
        <div className="flex-[30] min-h-0 grid grid-cols-3 gap-2">
          <ChartCard
            title="Quarterly Revenue"
            subtitle="Actual and forecast"
            loading={forecastLoading}
          >
            <BarChart
              data={growthProjections}
              xKey="quarter"
              yKeys={['historical', 'projected']}
              labels={{ historical: 'Actual', projected: 'Forecast' }}
              formatY="currency"
              stacked
              colors={['var(--color-chart-1)', 'var(--color-chart-2)']}
            />
          </ChartCard>

          <ChartCard title="Model Performance" subtitle="Measured on holdout" loading={modelLoading}>
            <div className="h-full grid grid-cols-2 gap-3 content-center">
              <div className="text-center p-2 bg-gray-800/50 rounded-lg">
                <div className="text-2xl font-bold text-white">{pct(revenueMetrics?.mape)}</div>
                <div className="text-xs text-gray-400">Forecast MAPE</div>
              </div>
              <div className="text-center p-2 bg-gray-800/50 rounded-lg">
                <div className="text-2xl font-bold text-white">{pct(revenueMetrics?.naiveMape)}</div>
                <div className="text-xs text-gray-400">Naive baseline</div>
              </div>
              <div className="text-center p-2 bg-gray-800/50 rounded-lg">
                <div className="text-2xl font-bold text-white">
                  {churnMetrics?.rocAuc?.toFixed(3) ?? '—'}
                </div>
                <div className="text-xs text-gray-400">Churn ROC AUC</div>
              </div>
              <div className="text-center p-2 bg-gray-800/50 rounded-lg">
                <div className="text-2xl font-bold text-white">
                  {revenueMetrics?.trainMonths ?? '—'} mo
                </div>
                <div className="text-xs text-gray-400">Training window</div>
              </div>
            </div>
          </ChartCard>

          <ChartCard
            title="Revenue by Segment"
            subtitle="Selected period"
            loading={segmentsLoading}
          >
            <DonutChart
              data={segmentForecast}
              nameKey="segment"
              valueKey="value"
              formatValue="currency"
            />
          </ChartCard>
        </div>

        {/* Row 4: Churn Risk + Revenue at Risk - 40% */}
        <div className="flex-[40] min-h-0 grid grid-cols-2 gap-2">
          <ChartCard
            title="Churn Risk Predictions"
            subtitle="At-risk customers"
            loading={churnLoading}
          >
            <DataTable
              data={churnData}
              keyExtractor={(row) => row.id}
              columns={[
                { key: 'company', header: 'Company', sortable: true },
                { key: 'segment', header: 'Segment', sortable: true },
                {
                  key: 'ltv',
                  header: 'LTV',
                  sortable: true,
                  align: 'right',
                  render: (value) => formatCurrency(value as number),
                },
                {
                  key: 'riskScore',
                  header: 'Risk',
                  sortable: true,
                  align: 'right',
                  render: (value) => {
                    const score = value as number;
                    const color = score >= 0.7 ? 'text-danger' : score >= 0.5 ? 'text-warning' : 'text-success';
                    return (
                      <span className={`font-medium ${color}`}>
                        {(score * 100).toFixed(0)}%
                      </span>
                    );
                  },
                },
                {
                  key: 'recommendation',
                  header: 'Action',
                  render: (value) => (
                    <span className="px-1.5 py-0.5 text-xs rounded-full bg-primary-500/20 text-primary-400">
                      {value as string}
                    </span>
                  ),
                },
              ]}
              compact
            />
          </ChartCard>

          <ChartCard title="Revenue at Risk" subtitle="By risk category" loading={riskLoading}>
            <div className="h-full flex flex-col justify-between gap-1.5">
              <div className="flex-1 min-h-0 flex items-center justify-between px-3 bg-danger/10 rounded-lg border border-danger/20">
                <div>
                  <div className="text-sm font-medium text-danger">High Risk</div>
                  <div className="text-xs text-gray-400">{revenueAtRisk?.highRisk.customers ?? '—'} customers · {revenueAtRisk?.highRisk.threshold || '65%+ risk'}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-white">{revenueAtRisk ? formatCurrency(revenueAtRisk.highRisk.value) : '—'}</div>
                </div>
              </div>
              <div className="flex-1 min-h-0 flex items-center justify-between px-3 bg-warning/10 rounded-lg border border-warning/20">
                <div>
                  <div className="text-sm font-medium text-warning">Medium Risk</div>
                  <div className="text-xs text-gray-400">{revenueAtRisk?.mediumRisk.customers ?? '—'} customers · {revenueAtRisk?.mediumRisk.threshold || '50-65% risk'}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-white">{revenueAtRisk ? formatCurrency(revenueAtRisk.mediumRisk.value) : '—'}</div>
                </div>
              </div>
              <div className="flex-1 min-h-0 flex items-center justify-between px-3 bg-success/10 rounded-lg border border-success/20">
                <div>
                  <div className="text-sm font-medium text-success">Low Risk</div>
                  <div className="text-xs text-gray-400">{revenueAtRisk?.lowRisk.customers ?? '—'} customers · {revenueAtRisk?.lowRisk.threshold || '<50% risk'}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-white">{revenueAtRisk ? formatCurrency(revenueAtRisk.lowRisk.value) : '—'}</div>
                </div>
              </div>
              <div className="flex-1 min-h-0 flex items-center justify-between px-3 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="text-sm font-medium text-gray-300">Total Revenue at Risk</div>
                <div className="text-xl font-bold text-white">{revenueAtRisk ? formatCurrency(revenueAtRisk.total) : '—'}</div>
              </div>
            </div>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
