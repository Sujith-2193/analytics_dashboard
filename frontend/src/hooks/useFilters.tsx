/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { subDays, subMonths, startOfYear, format } from 'date-fns';
import type { DateRange, FilterState } from '../types';
import { today as currentDate } from '../services/staticData';

type DatePreset = 'last7d' | 'last30d' | 'last90d' | 'ytd' | 'lastYear' | 'custom';

function getDateRangeFromPreset(preset: DatePreset): DateRange {
  // Live, this is the actual date. In the static demo it is the date the
  // snapshot was taken, so a preset resolves to the window the snapshot holds
  // rather than to a window that moved past it overnight.
  const today = currentDate();
  const formatDate = (date: Date) => format(date, 'yyyy-MM-dd');

  switch (preset) {
    case 'last7d':
      return {
        startDate: formatDate(subDays(today, 7)),
        endDate: formatDate(today),
        preset,
      };
    case 'last30d':
      return {
        startDate: formatDate(subDays(today, 30)),
        endDate: formatDate(today),
        preset,
      };
    case 'last90d':
      return {
        startDate: formatDate(subDays(today, 90)),
        endDate: formatDate(today),
        preset,
      };
    case 'ytd':
      return {
        startDate: formatDate(startOfYear(today)),
        endDate: formatDate(today),
        preset,
      };
    case 'lastYear':
      return {
        startDate: formatDate(subMonths(today, 12)),
        endDate: formatDate(today),
        preset,
      };
    default:
      return {
        startDate: formatDate(subDays(today, 30)),
        endDate: formatDate(today),
        preset: 'last30d',
      };
  }
}

interface FilterContextType {
  filters: FilterState;
  setDateRange: (range: DateRange) => void;
  setDatePreset: (preset: DatePreset) => void;
  setRegion: (region: string | undefined) => void;
  setSegment: (segment: string | undefined) => void;
  setCategory: (category: string | undefined) => void;
  resetFilters: () => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

/**
 * Built on demand, never at module load.
 *
 * A module-level constant would resolve its date range the moment this file is
 * imported, which in the static demo is before the snapshot manifest has said
 * what "today" is. The default range would then be computed against the real
 * clock and miss the snapshot, while every range the user picked afterwards hit.
 */
function makeDefaultFilters(): FilterState {
  return {
    dateRange: getDateRangeFromPreset('last90d'),
    region: undefined,
    segment: undefined,
    category: undefined,
  };
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<FilterState>(makeDefaultFilters);

  const setDateRange = useCallback((range: DateRange) => {
    setFilters((prev) => ({ ...prev, dateRange: range }));
  }, []);

  const setDatePreset = useCallback((preset: DatePreset) => {
    setFilters((prev) => ({
      ...prev,
      dateRange: getDateRangeFromPreset(preset),
    }));
  }, []);

  const setRegion = useCallback((region: string | undefined) => {
    setFilters((prev) => ({ ...prev, region }));
  }, []);

  const setSegment = useCallback((segment: string | undefined) => {
    setFilters((prev) => ({ ...prev, segment }));
  }, []);

  const setCategory = useCallback((category: string | undefined) => {
    setFilters((prev) => ({ ...prev, category }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(makeDefaultFilters());
  }, []);

  return (
    <FilterContext.Provider
      value={{
        filters,
        setDateRange,
        setDatePreset,
        setRegion,
        setSegment,
        setCategory,
        resetFilters,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters(): FilterContextType {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error('useFilters must be used within a FilterProvider');
  }
  return context;
}

export { getDateRangeFromPreset };
export type { DatePreset };
