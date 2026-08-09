import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportToCSV, exportToJSON } from './export'

const dateRange = { startDate: '2026-01-01', endDate: '2026-06-30' }

function summary(overrides: Record<string, unknown> = {}) {
  return {
    kpis: {
      totalRevenue: { value: 1234567, previousValue: 1000000, changePercent: 23.5 },
      totalCustomers: { value: 2000, previousValue: 1800, changePercent: 11.1 },
      avgOrderValue: { value: 1500, changePercent: 4.2 },
      pipelineValue: { value: 8500000, changePercent: -2.1 },
    },
    revenueTrend: [{ date: '2026-01-01', revenue: 50000, orders: 32 }],
    revenueByCategory: [{ category: 'Cloud Infrastructure', value: 900000, percentage: 30 }],
    topProducts: [
      { name: 'Acme Platform', category: 'Enterprise Software', revenue: 250000, unitsSold: 12, growth: 8.4 },
    ],
    pipelineSummary: [{ stage: 'negotiation', value: 400000, count: 9, conversionRate: 65 }],
    ...overrides,
  } as never
}

let captured: string
let createdLink: HTMLAnchorElement

beforeEach(() => {
  captured = ''
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  })
  // Capture what would have been written to disk.
  vi.spyOn(globalThis, 'Blob').mockImplementation(function (parts: unknown[]) {
    captured = (parts as string[]).join('')
    return { size: captured.length, type: 'text/csv' } as Blob
  } as never)
  const realCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = realCreate(tag)
    if (tag === 'a') {
      createdLink = el as HTMLAnchorElement
      el.click = vi.fn()
    }
    return el
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('exportToCSV', () => {
  it('writes a file named for the date range', () => {
    exportToCSV({ summary: summary(), dateRange })
    expect(createdLink.download).toBe('analytics-export-2026-01-01-to-2026-06-30.csv')
  })

  it('includes each section heading', () => {
    exportToCSV({ summary: summary(), dateRange })
    for (const heading of [
      'KEY PERFORMANCE INDICATORS',
      'REVENUE TREND',
      'REVENUE BY CATEGORY',
      'TOP PRODUCTS',
      'PIPELINE SUMMARY',
    ]) {
      expect(captured).toContain(heading)
    }
  })

  it('emits currency without thousands separators', () => {
    /*
     * Regression test. Currency was formatted with Intl.NumberFormat, so
     * 1234567 became "$1,234,567". Those commas are field delimiters once the
     * file opens in a spreadsheet, which split one revenue figure across three
     * columns and shifted every heading after it.
     */
    exportToCSV({ summary: summary(), dateRange })
    expect(captured).toContain('$1234567')
    expect(captured).not.toContain('$1,234,567')
  })

  it('keeps every data row at the expected column count', () => {
    exportToCSV({ summary: summary(), dateRange })
    const kpiRow = captured
      .split('\n')
      .find((line) => line.startsWith('Total Revenue'))!
    // Metric, Current, Previous, Change
    expect(kpiRow.split(',')).toHaveLength(4)
  })

  it('quotes fields containing a comma', () => {
    exportToCSV({
      summary: summary({
        topProducts: [
          { name: 'Widget, Large', category: 'Hardware', revenue: 100, unitsSold: 1, growth: 0 },
        ],
      }),
      dateRange,
    })
    expect(captured).toContain('"Widget, Large"')
  })

  it('escapes embedded double quotes by doubling them', () => {
    exportToCSV({
      summary: summary({
        topProducts: [
          { name: 'The "Pro" Bundle', category: 'Software', revenue: 100, unitsSold: 1, growth: 0 },
        ],
      }),
      dateRange,
    })
    expect(captured).toContain('"The ""Pro"" Bundle"')
  })

  it('omits sections with no rows rather than emitting a bare heading', () => {
    exportToCSV({
      summary: summary({ topProducts: [], revenueByCategory: [] }),
      dateRange,
    })
    expect(captured).not.toContain('TOP PRODUCTS')
    expect(captured).not.toContain('REVENUE BY CATEGORY')
    expect(captured).toContain('KEY PERFORMANCE INDICATORS')
  })

  it('survives missing optional sections entirely', () => {
    expect(() =>
      exportToCSV({
        summary: summary({
          revenueTrend: undefined,
          revenueByCategory: undefined,
          topProducts: undefined,
          pipelineSummary: undefined,
        }),
        dateRange,
      })
    ).not.toThrow()
  })

  it('triggers exactly one download', () => {
    exportToCSV({ summary: summary(), dateRange })
    expect(createdLink.click).toHaveBeenCalledOnce()
  })

  it('cleans up the object URL', () => {
    exportToCSV({ summary: summary(), dateRange })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })
})

describe('exportToJSON', () => {
  it('writes valid, parseable JSON', () => {
    exportToJSON({ summary: summary(), dateRange })
    expect(() => JSON.parse(captured)).not.toThrow()
  })

  it('preserves numeric values rather than stringifying them', () => {
    exportToJSON({ summary: summary(), dateRange })
    const parsed = JSON.parse(captured)
    const serialised = JSON.stringify(parsed)
    expect(serialised).toContain('1234567')
    expect(serialised).not.toContain('"$1234567"')
  })

  it('names the file for the date range', () => {
    exportToJSON({ summary: summary(), dateRange })
    expect(createdLink.download).toContain('2026-01-01')
    expect(createdLink.download).toMatch(/\.json$/)
  })
})
