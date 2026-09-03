import { RefreshCw, Moon, Sun, Bell, X } from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useFilters, type DatePreset } from '../../hooks/useFilters';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

const datePresets: { value: DatePreset; label: string }[] = [
  { value: 'last7d', label: 'Last 7 days' },
  { value: 'last30d', label: 'Last 30 days' },
  { value: 'last90d', label: 'Last 90 days' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'lastYear', label: 'Last 12 months' },
];

const mockNotifications = [
  { id: 1, message: 'Revenue target exceeded by 15%', time: '2 hours ago', read: false },
  { id: 2, message: 'New enterprise customer signed', time: '5 hours ago', read: false },
  { id: 3, message: 'Pipeline milestone reached', time: '1 day ago', read: true },
];

export function Header({ title, subtitle }: HeaderProps) {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true';
    }
    return false;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState(mockNotifications);
  const { filters, setDatePreset } = useFilters();
  const queryClient = useQueryClient();
  const notifRef = useRef<HTMLDivElement>(null);

  // Initialize dark mode on mount
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setIsRefreshing(false), 1000);
  }, [queryClient]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const newValue = !prev;
      localStorage.setItem('darkMode', String(newValue));
      if (newValue) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return newValue;
    });
  }, []);

  const markNotificationRead = useCallback((id: number) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="sticky top-0 z-30 h-14 flex-shrink-0 border-b border-black/10 bg-white/75 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/70">
      <div className="flex h-full items-center justify-between gap-3 px-4">
        {/* Title */}
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-base font-semibold text-zinc-950 dark:text-white">{title}</h1>
          {subtitle && (
            <p className="hidden text-xs text-zinc-500 sm:block dark:text-zinc-400">|&nbsp; {subtitle}</p>
          )}
        </div>

        {/* Controls */}
        <div className="flex min-w-0 items-center gap-2">
          {/* Date Range Selector */}
          <div className="hidden items-center rounded-lg border border-black/10 bg-white/70 p-0.5 shadow-sm lg:flex dark:border-white/10 dark:bg-white/5">
            {datePresets.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setDatePreset(preset.value)}
                className={clsx(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                  filters.dateRange.preset === preset.value
                    ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label="Refresh data"
            >
              <RefreshCw
                className={clsx('h-4 w-4', isRefreshing && 'animate-spin')}
              />
            </button>

            {/* Notifications Dropdown */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-rose-500">
                    <span className="sr-only">{unreadCount} unread</span>
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-black/10 bg-white shadow-2xl shadow-black/15 dark:border-white/10 dark:bg-zinc-900">
                  <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
                    <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">Notifications</h3>
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.map((notif) => (
                      <button
                        key={notif.id}
                        onClick={() => markNotificationRead(notif.id)}
                        className={clsx(
                          'w-full border-b border-black/10 px-4 py-3 text-left transition-colors last:border-0 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/10',
                          !notif.read && 'bg-emerald-50/70 dark:bg-emerald-500/10'
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {!notif.read && (
                            <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
                          )}
                          <div className={clsx(!notif.read ? '' : 'ml-4')}>
                            <p className="text-sm text-zinc-800 dark:text-zinc-200">{notif.message}</p>
                            <p className="mt-1 text-xs text-zinc-500">{notif.time}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-black/10 px-4 py-2 dark:border-white/10">
                    <button className="text-sm text-emerald-700 hover:text-emerald-600 dark:text-emerald-300">
                      View all notifications
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={toggleDarkMode}
              className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
