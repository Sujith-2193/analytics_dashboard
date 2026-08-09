import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KPICard, KPIGrid } from './KPICard'

describe('KPICard', () => {
  it('renders the label and a compact value', () => {
    render(<KPICard label="Revenue" value={1_200_000} format="currency" />)
    expect(screen.getByText('Revenue')).toBeInTheDocument()
    expect(screen.getByText('$1.2M')).toBeInTheDocument()
  })

  it('formats by the requested type', () => {
    const { rerender } = render(<KPICard label="Count" value={2500} format="number" />)
    expect(screen.getByText('2.5K')).toBeInTheDocument()

    rerender(<KPICard label="Rate" value={91.25} format="percent" />)
    expect(screen.getByText('91.3%')).toBeInTheDocument()
  })

  it('defaults to number formatting', () => {
    render(<KPICard label="Things" value={1500} />)
    expect(screen.getByText('1.5K')).toBeInTheDocument()
  })

  describe('the change badge', () => {
    it('shows a positive delta with a sign', () => {
      render(<KPICard label="Revenue" value={100} changePercent={12.3} />)
      expect(screen.getByText('+12.3%')).toBeInTheDocument()
    })

    it('shows a negative delta as a magnitude', () => {
      // The arrow carries the direction, so the badge prints the absolute value.
      render(<KPICard label="Revenue" value={100} changePercent={-8.5} />)
      expect(screen.getByText('+8.5%')).toBeInTheDocument()
    })

    it('is omitted when changePercent is undefined', () => {
      render(<KPICard label="Revenue" value={100} />)
      expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
    })

    it('is omitted when changePercent is null', () => {
      /*
       * Regression test. The API returns null for deltas it cannot compute,
       * because no prior observation exists to difference against. The guard
       * here was `changePercent !== undefined`, and since `null !== undefined`
       * is true, a null delta rendered a "+0.0%" badge with a neutral arrow.
       * That invented a data point the backend had deliberately declined to
       * invent.
       */
      render(<KPICard label="At Risk" value={1630} changePercent={null} />)
      expect(screen.queryByText('+0.0%')).not.toBeInTheDocument()
      expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
    })

    it('still renders a zero delta, which is a real measurement', () => {
      render(<KPICard label="Flat" value={100} changePercent={0} />)
      expect(screen.getByText('+0.0%')).toBeInTheDocument()
    })
  })

  it('renders a skeleton and no value while loading', () => {
    const { container } = render(
      <KPICard label="Revenue" value={1_200_000} format="currency" loading />
    )
    expect(screen.queryByText('$1.2M')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('renders an icon when given one', () => {
    render(<KPICard label="Revenue" value={100} icon={<span data-testid="icon" />} />)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('applies an extra className', () => {
    const { container } = render(
      <KPICard label="Revenue" value={100} className="custom-class" />
    )
    expect(container.querySelector('.custom-class')).toBeInTheDocument()
  })

  it('handles a zero value without collapsing', () => {
    render(<KPICard label="Empty" value={0} format="currency" />)
    expect(screen.getByText('$0')).toBeInTheDocument()
  })
})

describe('KPIGrid', () => {
  it('renders its children', () => {
    render(
      <KPIGrid>
        <KPICard label="One" value={1} />
        <KPICard label="Two" value={2} />
      </KPIGrid>
    )
    expect(screen.getByText('One')).toBeInTheDocument()
    expect(screen.getByText('Two')).toBeInTheDocument()
  })
})
