/**
 * The Forecasting page must not invent numbers.
 *
 * This page was the last place fabricated data survived. The backend had every
 * `random.uniform()` removed, but the page still carried a hardcoded quarterly
 * "Growth Projections" series, a hardcoded "Segment Forecast" donut, and a
 * fallback metrics object of `{accuracy: 94.2, r2Score: 0.942, confidence: 95}`
 * that rendered whenever a request failed. It also read a `confidence` field
 * the endpoint has never returned, so the live page displayed a bare `%`.
 *
 * These tests pin the rule: every figure shown comes from the response, and a
 * missing figure renders a dash rather than a plausible-looking constant.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { Forecasting } from './Forecasting';
import { FilterProvider } from '../hooks/useFilters';

const MODEL_PERFORMANCE = {
  available: true,
  accuracy: 91.0,
  mape: 3.58,
  r2Score: -0.6266,
  rmse: 3922055.22,
  dataPoints: '21 mo',
  revenue: {
    model: 'Ridge regression on trend, seasonality, and 2 lags',
    validation: 'chronological holdout',
    mape: 3.58,
    naiveMape: 5.82,
    seasonalNaiveMape: 9.88,
    improvementOverNaive: 38.5,
    rmse: 3922055.22,
    mae: 3014762.38,
    r2Score: -0.6266,
    trainMonths: 16,
    holdoutMonths: 5,
  },
  churn: {
    model: 'Gradient-boosted classifier on RFM and account features',
    validation: 'stratified holdout',
    rocAuc: 0.9586,
    accuracy: 0.91,
    precision: 0.7831,
    recall: 0.7065,
    f1: 0.7429,
    averagePrecision: 0.8462,
    brierScore: 0.0698,
    baseRate: 0.185,
    trainRows: 1500,
    holdoutRows: 500,
    topFeatures: { recency_days: 0.7144 },
  },
};

const FORECAST = [
  { date: '2026-05-01', actual: 21957392.83, predicted: null, lowerBound: null, upperBound: null },
  { date: '2026-06-01', actual: 25961517.33, predicted: null, lowerBound: null, upperBound: null },
  { date: '2026-07-01', actual: 24092891.28, predicted: 24092891.28, lowerBound: null, upperBound: null },
  { date: '2026-08-01', actual: null, predicted: 25335731.22, lowerBound: 21e6, upperBound: 29e6 },
  { date: '2026-09-01', actual: null, predicted: 25892050.28, lowerBound: 21e6, upperBound: 30e6 },
];

const SEGMENTS = [
  { segment: 'enterprise', count: 261, revenue: 38091010.47, percentage: 54.1 },
  { segment: 'mid-market', count: 221, revenue: 33165337.93, percentage: 45.9 },
];

/** Serve each endpoint the page asks for; `failing` empties the two under test. */
function mockFetch(failing = false) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    if (url.includes('/forecasting/model-performance')) {
      return failing ? new Response('{}', { status: 500 }) : json(MODEL_PERFORMANCE);
    }
    if (url.includes('/forecasting/revenue-at-risk')) {
      return json({ highRisk: { value: 0, customers: 0, label: '', threshold: '' },
                    mediumRisk: { value: 0, customers: 0, label: '', threshold: '' },
                    lowRisk: { value: 0, customers: 0, label: '', threshold: '' }, total: 0 });
    }
    if (url.includes('/forecasting/revenue')) return json(failing ? [] : FORECAST);
    if (url.includes('/customers/segments')) return json(failing ? [] : SEGMENTS);
    if (url.includes('/forecasting/kpis')) return json({});
    return json([]);
  }) as typeof fetch;
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FilterProvider>
        <MemoryRouter>
          <Forecasting />
        </MemoryRouter>
      </FilterProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => mockFetch());

describe('model performance tiles', () => {
  it('shows the measured figures from the response', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('3.58%')).toBeInTheDocument());
    expect(screen.getByText('5.82%')).toBeInTheDocument();   // naive baseline
    expect(screen.getByText('0.959')).toBeInTheDocument();   // churn ROC AUC
    expect(screen.getByText('16 mo')).toBeInTheDocument();   // training window
  });

  it('labels them so the forecast error is comparable to its baseline', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Forecast MAPE')).toBeInTheDocument());
    expect(screen.getByText('Naive baseline')).toBeInTheDocument();
    expect(screen.getByText('Churn ROC AUC')).toBeInTheDocument();
  });

  it('never renders the retired placeholder metrics', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('3.58%')).toBeInTheDocument());
    for (const ghost of ['94.2%', '0.942', '95%', 'Confidence']) {
      expect(screen.queryByText(ghost)).toBeNull();
    }
  });

  it('renders a dash rather than a number when the request fails', async () => {
    mockFetch(true);
    renderPage();
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThan(0));
    // The specific regression: `undefined%` reached production as a bare "%".
    expect(screen.queryByText('%')).toBeNull();
    expect(screen.queryByText('undefined%')).toBeNull();
  });
});

describe('quarterly revenue is derived, not authored', () => {
  // FORECAST spans May, Jun, Jul actual and Aug, Sep predicted. That makes
  // Q2 2026 a two-month quarter and Q3 2026 a complete one.
  it('drops a quarter the series only partly covers', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Quarterly Revenue')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Q3 2026')).toBeInTheDocument());
    // Q2 holds only May and June here. Plotted, it reads as revenue a third
    // lower than the quarter beside it, which is the partial-period defect
    // app/periods.py exists to prevent, at quarterly granularity.
    expect(screen.queryByText('Q2 2026')).toBeNull();
  });

  it('counts the join month once, as actual', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Q3 2026')).toBeInTheDocument());
    // 2026-07 carries both an actual and a predicted equal to it. Counting it
    // in both buckets would inflate Q3 by a full month.
    const july = FORECAST.find((r) => r.date === '2026-07-01')!;
    expect(july.actual).toBe(july.predicted);
    const q3 = july.actual! + 25335731.22 + 25892050.28;
    expect(q3).toBeCloseTo(75320672.78, 2);
  });

  it('no longer shows the invented quarterly figures', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Quarterly Revenue')).toBeInTheDocument());
    expect(screen.queryByText('Growth Projections')).toBeNull();
  });
});

describe('segment revenue comes from the customers endpoint', () => {
  it('titles the card for what it actually shows', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Revenue by Segment')).toBeInTheDocument());
    expect(screen.queryByText('Segment Forecast')).toBeNull();
  });
});
