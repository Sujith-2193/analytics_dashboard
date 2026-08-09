import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  customerApi,
  dashboardApi,
  forecastingApi,
  healthApi,
  operationsApi,
  revenueApi,
} from './api'

const range = { startDate: '2026-01-01', endDate: '2026-06-30' }

function mockFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const spy = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

function lastUrl(spy: ReturnType<typeof vi.fn>): string {
  return spy.mock.calls.at(-1)![0] as string
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('request construction', () => {
  it('sends JSON content type', async () => {
    const spy = mockFetch({})
    await healthApi.check()
    expect(spy.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    })
  })

  it('encodes the date range into the query string', async () => {
    const spy = mockFetch({})
    await dashboardApi.getSummary(range)
    const url = lastUrl(spy)
    expect(url).toContain('/dashboard/summary?')
    expect(url).toContain('start_date=2026-01-01')
    expect(url).toContain('end_date=2026-06-30')
  })

  it('omits undefined parameters rather than sending the string "undefined"', async () => {
    const spy = mockFetch({})
    await dashboardApi.getSummary({ startDate: undefined, endDate: undefined } as never)
    expect(lastUrl(spy)).not.toContain('undefined')
  })

  it('produces no query string when every parameter is absent', async () => {
    const spy = mockFetch({})
    await dashboardApi.getSummary({} as never)
    expect(lastUrl(spy)).toBe('/api/dashboard/summary')
  })

  it('url-encodes parameter values', async () => {
    const spy = mockFetch({})
    await revenueApi.getTrends({ startDate: 'a b&c', endDate: '2026-01-01' }, 'month')
    const url = lastUrl(spy)
    expect(url).toContain('a%20b%26c')
    expect(url).not.toContain('a b&c')
  })

  it('passes granularity through and defaults it to day', async () => {
    const spy = mockFetch([])
    await revenueApi.getTrends(range, 'month')
    expect(lastUrl(spy)).toContain('granularity=month')

    await revenueApi.getTrends(range)
    expect(lastUrl(spy)).toContain('granularity=day')
  })
})

describe('error handling', () => {
  it('throws with the server-supplied message', async () => {
    mockFetch({ message: 'Database unavailable' }, { ok: false, status: 500 })
    await expect(dashboardApi.getSummary(range)).rejects.toThrow('Database unavailable')
  })

  it('falls back to the status code when the body carries no message', async () => {
    mockFetch({}, { ok: false, status: 404 })
    await expect(dashboardApi.getSummary(range)).rejects.toThrow('404')
  })

  it('survives an error body that is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON')
        },
      })
    )
    // A gateway returning an HTML error page must not surface as a parse crash.
    await expect(dashboardApi.getSummary(range)).rejects.toThrow('An error occurred')
  })

  it('propagates a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(dashboardApi.getSummary(range)).rejects.toThrow('Failed to fetch')
  })
})

describe('response handling', () => {
  it('returns the parsed body', async () => {
    const payload = { kpis: { revenue: 1000 } }
    mockFetch(payload)
    await expect(dashboardApi.getSummary(range)).resolves.toEqual(payload)
  })

  it('returns arrays intact', async () => {
    mockFetch([{ date: '2026-01-01', revenue: 5 }])
    await expect(revenueApi.getTrends(range)).resolves.toHaveLength(1)
  })
})

describe('endpoint paths', () => {
  const cases: Array<[string, () => Promise<unknown>, string]> = [
    ['dashboard summary', () => dashboardApi.getSummary(range), '/dashboard/summary'],
    ['dashboard kpis', () => dashboardApi.getKPIs(range), '/dashboard/kpis'],
    ['revenue trends', () => revenueApi.getTrends(range), '/revenue/trends'],
    ['revenue by category', () => revenueApi.getByCategory(range), '/revenue/by-category'],
    ['revenue by region', () => revenueApi.getByRegion(range), '/revenue/by-region'],
    ['health', () => healthApi.check(), '/health'],
  ]

  it.each(cases)('%s hits the right path', async (_name, call, path) => {
    const spy = mockFetch({})
    await call()
    expect(lastUrl(spy)).toContain(path)
  })

  it('every exported api namespace is populated', () => {
    for (const api of [
      dashboardApi,
      revenueApi,
      customerApi,
      operationsApi,
      forecastingApi,
      healthApi,
    ]) {
      const fns = Object.values(api).filter((v) => typeof v === 'function')
      expect(fns.length).toBeGreaterThan(0)
    }
  })

  it('all forecasting endpoints sit under /forecasting', async () => {
    for (const [name, fn] of Object.entries(forecastingApi)) {
      if (typeof fn !== 'function') continue
      const spy = mockFetch({})
      await (fn as (r: typeof range) => Promise<unknown>)(range)
      expect(lastUrl(spy), `${name} path`).toContain('/forecasting/')
    }
  })
})
