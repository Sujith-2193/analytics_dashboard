import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import clsx from 'clsx';
import { Sidebar } from './Sidebar';

export function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="app-shell h-screen overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className={clsx(
          'relative h-screen transition-all duration-300 overflow-hidden',
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
