import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  DollarSign,
  Users,
  Settings2,
  TrendingUp,
  Activity,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import { IS_STATIC, getManifest } from '../../services/staticData';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Revenue', href: '/revenue', icon: DollarSign },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Operations', href: '/operations', icon: Settings2 },
  { name: 'Forecasting', href: '/forecasting', icon: TrendingUp },
];

interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function Sidebar({ collapsed, onCollapsedChange }: SidebarProps) {
  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 z-40 h-screen border-r border-white/10 bg-zinc-950/90 text-white shadow-2xl shadow-black/20 backdrop-blur-xl transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
        {!collapsed && (
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/20">
              <Activity className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold">SignalFlow</span>
              <span className="block truncate text-[11px] text-zinc-400">Analytics cockpit</span>
            </div>
          </div>
        )}
        <button
          onClick={() => onCollapsedChange(!collapsed)}
          className={clsx(
            'rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white',
            collapsed && 'mx-auto'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="flex flex-col gap-1 p-2">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              clsx(
                'group relative flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-white text-zinc-950 shadow-lg shadow-emerald-500/10'
                  : 'text-zinc-400 hover:bg-white/10 hover:text-white'
              )
            }
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span>{item.name}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 px-3 py-3">
          <div className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-zinc-400">
            <p className="font-medium text-zinc-200">FastAPI intelligence layer</p>
            {/*
              The demo's data is frozen at the date it was generated, and its
              date presets resolve against that date. Saying so is the honest
              thing: without it the dashboard silently claims to be current.
            */}
            {IS_STATIC && getManifest() && (
              <p className="mt-1 text-zinc-500">
                Static demo &middot; data as of {getManifest()!.snapshotDate}
              </p>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
