import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AreaChart } from './AreaChart'
import { BarChart } from './BarChart'
import { FunnelChart } from './FunnelChart'
import { PieChart } from './PieChart'

const series = [
  { date: '2026-01-01', revenue: 50000, orders: 320 },
  { date: '2026-02-01', revenue: 62000, orders: 410 },
  { date: '2026-03-01', revenue: 58000, orders: 380 },
]

const categories = [
  { category: 'Cloud', value: 900000 },
  { category: 'Security', value: 640000 },
  { category: 'Data', value: 410000 },
]

const stages = [
  { stage: 'lead', value: 900000, count: 180 },
  { stage: 'qualified', value: 620000, count: 96 },
  { stage: 'proposal', value: 410000, count: 51 },
  { stage: 'negotiation', value: 260000, count: 24 },
]

/** Recharts renders into SVG; grab it from the container. */
function svg(container: HTMLElement) {
  return container.querySelector('svg')
}

describe('AreaChart', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <AreaChart data={series} xKey="date" yKeys={['revenue']} height={300} />
    )
    expect(svg(container)).toBeInTheDocument()
  })

  it('draws solid gridlines, never dashed', () => {
    /*
     * Dashing a grid adds noise and reads as "projection" or "threshold" when
     * it is only a grid. The dashes here were 3 3. Dashed *data* lines stay
     * legal, and that is what dashedKeys is for.
     */
    const { container } = render(
      <AreaChart data={series} xKey="date" yKeys={['revenue']} height={300} />
    )
    const grid = container.querySelectorAll('.recharts-cartesian-grid line')
    expect(grid.length).toBeGreaterThan(0)
    grid.forEach((line) => {
      expect(line.getAttribute('stroke-dasharray')).toBeFalsy()
    })
  })

  it('accepts dashedKeys for a forecast series', () => {
    /*
     * Dashed *data* stays legal and signals a projection; only the grid had to
     * go solid.
     *
     * This is a render smoke test rather than an assertion on the stroke.
     * Recharts computes its Area paths from a measured container, and jsdom has
     * no layout engine, so the series paths never reach the DOM here and
     * stroke-dasharray cannot be read back. Asserting on it would produce a
     * test that passes for the wrong reason. The grid-is-solid test above is
     * the one that covers the actual change.
     */
    const { container } = render(
      <AreaChart
        data={series}
        xKey="date"
        yKeys={['revenue', 'orders']}
        dashedKeys={['orders']}
        height={300}
      />
    )
    expect(svg(container)).toBeInTheDocument()
  })

  it('shows a legend once there are two series', () => {
    render(<AreaChart data={series} xKey="date" yKeys={['revenue', 'orders']} height={300} />)
    expect(screen.getByText('revenue')).toBeInTheDocument()
    expect(screen.getByText('orders')).toBeInTheDocument()
  })

  it('omits the legend for a single series', () => {
    // The card title already names it; a one-entry legend is chrome.
    render(<AreaChart data={series} xKey="date" yKeys={['revenue']} height={300} />)
    expect(screen.queryByText('revenue')).not.toBeInTheDocument()
  })
})

describe('BarChart', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <BarChart data={categories} xKey="category" yKeys={['value']} height={300} />
    )
    expect(svg(container)).toBeInTheDocument()
  })

  it('draws solid gridlines', () => {
    const { container } = render(
      <BarChart data={categories} xKey="category" yKeys={['value']} height={300} />
    )
    container.querySelectorAll('.recharts-cartesian-grid line').forEach((line) => {
      expect(line.getAttribute('stroke-dasharray')).toBeFalsy()
    })
  })

  it('renders bar layers for every category', () => {
    const { container } = render(
      <BarChart data={categories} xKey="category" yKeys={['value']} height={300} />
    )
    expect(
      container.querySelectorAll('.recharts-bar-rectangle').length
    ).toBe(categories.length)
  })

  it('accepts the ordinal flag without crashing', () => {
    const { container } = render(
      <BarChart data={categories} xKey="category" yKeys={['value']} ordinal height={300} />
    )
    expect(svg(container)).toBeInTheDocument()
  })
})

describe('PieChart', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <PieChart data={categories} nameKey="category" valueKey="value" />
    )
    expect(svg(container)).toBeInTheDocument()
  })

  it('shows a legend, so identity is never colour alone', () => {
    // Entries read "Cloud (46.2%)", so match the label rather than the whole node.
    const { container } = render(
      <PieChart data={categories} nameKey="category" valueKey="value" />
    )
    categories.forEach((c) => expect(container.textContent).toContain(c.category))
  })
})

describe('FunnelChart', () => {
  it('renders every stage', () => {
    render(<FunnelChart data={stages} />)
    stages.forEach((s) => expect(screen.getByText(s.stage)).toBeInTheDocument())
  })

  it('colours stages with the ordinal ramp, not categorical hues', () => {
    /*
     * Funnel stages are ordered, so they take one hue stepped light to dark.
     * Eight unrelated hues implied the stages were separate identities, and the
     * palette was indexed with a modulo so a seventh stage reused the first
     * stage's colour.
     */
    const { container } = render(<FunnelChart data={stages} />)
    const styled = [...container.querySelectorAll<HTMLElement>('[style*="background-color"]')]
    expect(styled.length).toBeGreaterThan(0)
    styled.forEach((el) => {
      expect(el.getAttribute('style')).toContain('--color-ordinal-')
    })
  })

  it('reads as monotonic across stages', () => {
    const { container } = render(<FunnelChart data={stages} />)
    const steps = [...container.querySelectorAll<HTMLElement>('[style*="--color-ordinal-"]')]
      .map((el) => Number(el.getAttribute('style')!.match(/--color-ordinal-(\d)/)![1]))
    // Two marks per stage (swatch and bar); both walk the ramp in order.
    const unique = [...new Set(steps)]
    expect(unique).toEqual([...unique].sort((a, b) => a - b))
  })
})

describe('AreaChart confidence band', () => {
  const withBand = [
    { date: '2026-05-01', actual: 50000, predicted: null, lowerBound: null, upperBound: null },
    { date: '2026-06-01', actual: 62000, predicted: 62000, lowerBound: null, upperBound: null },
    { date: '2026-07-01', actual: null, predicted: 65000, lowerBound: 60000, upperBound: 70000 },
    { date: '2026-08-01', actual: null, predicted: 68000, lowerBound: 61000, upperBound: 75000 },
  ]

  it('renders with a band supplied', () => {
    /*
     * A render smoke test, not an assertion on the painted band. Recharts
     * computes Area geometry from a measured container and jsdom has no layout
     * engine, so no .recharts-area element reaches the DOM here for a banded or
     * an unbanded chart alike. Counting them would pass for the wrong reason.
     * The band's real verification is the legend test below plus looking at it.
     */
    const { container } = render(
      <AreaChart
        data={withBand}
        xKey="date"
        yKeys={['actual', 'predicted']}
        band={{ lower: 'lowerBound', upper: 'upperBound' }}
        height={300}
      />
    )
    expect(svg(container)).toBeInTheDocument()
  })

  it('renders without a band when none is supplied', () => {
    const { container } = render(
      <AreaChart data={withBand} xKey="date" yKeys={['actual']} height={300} />
    )
    expect(svg(container)).toBeInTheDocument()
  })

  it('tolerates null bounds on measured points', () => {
    // History has no uncertainty to draw, so both bounds are null there.
    expect(() =>
      render(
        <AreaChart
          data={withBand}
          xKey="date"
          yKeys={['actual', 'predicted']}
          band={{ lower: 'lowerBound', upper: 'upperBound' }}
          height={300}
        />
      )
    ).not.toThrow()
  })

  it('keeps the band out of the legend', () => {
    /* The band is context for the forecast, not a series. Giving it a legend
     * entry would imply a third measured thing on the chart. */
    render(
      <AreaChart
        data={withBand}
        xKey="date"
        yKeys={['actual', 'predicted']}
        band={{ lower: 'lowerBound', upper: 'upperBound', label: 'Forecast range' }}
        showLegend
        height={300}
      />
    )
    expect(screen.queryByText('Forecast range')).not.toBeInTheDocument()
  })
})
