import { NavLink, Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from './ErrorBoundary';

const NAV = [
  {
    heading: 'Resume',
    links: [
      { to: '/template', label: 'Template', icon: 'file' },
      { to: '/history', label: 'Work History', icon: 'briefcase' },
      { to: '/sections', label: 'Other Sections', icon: 'list' },
    ],
  },
  { heading: 'Jobs', links: [{ to: '/applications', label: 'Applications', icon: 'board' }, { to: '/agenda', label: 'Agenda', icon: 'list' }, { to: '/attention', label: 'Needs attention', icon: 'list' }] },
  {
    heading: 'System',
    links: [
      { to: '/runs', label: 'Agent Runs', icon: 'play' },
      { to: '/settings', label: 'Settings', icon: 'sliders' },
    ],
  },
];

export function Layout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 1300px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1300px)');
    const onChange = (event: MediaQueryListEvent) => setCollapsed(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return (
    <div className="flex min-h-screen">
      <aside
        className={`sticky top-0 h-screen shrink-0 self-start overflow-y-auto border-r border-slate-200 bg-white ${collapsed ? 'w-16' : 'w-56'}`}
      >
        <div
          className={`flex min-h-20 items-center gap-2 px-3 py-4 ${collapsed ? 'justify-center' : 'justify-between'}`}
        >
          <span className={collapsed ? 'sr-only' : 'text-sm font-semibold tracking-tight'}>Resume Builder</span>
          <button
            type="button"
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
            aria-expanded={!collapsed}
            aria-controls="primary-navigation"
            onClick={() => setCollapsed((value) => !value)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <path d={collapsed ? 'm9 5 7 7-7 7' : 'm15 5-7 7 7 7'} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <nav id="primary-navigation" aria-label="Main navigation" className="space-y-5 px-2 pb-6">
          {NAV.map((group, index) => (
            <div key={group.heading} className={collapsed && index > 0 ? 'border-t border-slate-100 pt-4' : ''}>
              <div
                className={
                  collapsed ? 'sr-only' : 'px-3 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase'
                }
              >
                {group.heading}
              </div>
              {group.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  aria-label={link.label}
                  title={collapsed ? link.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center rounded-md px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${collapsed ? 'justify-center' : 'gap-3'} ${
                      isActive ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-700 hover:bg-slate-100'
                    }`
                  }
                >
                  <NavIcon name={link.icon} />
                  <span className={collapsed ? 'sr-only' : ''}>{link.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
        <div className="@container mx-auto w-full max-w-[125rem]">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
import { useEffect, useState } from 'react';

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    file: 'M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h6',
    briefcase: 'M8 7V4h8v3M3 7h18v14H3ZM3 12l9 3 9-3M10 14v3h4v-3',
    list: 'M9 6h12M9 12h12M9 18h12M3 5h2v2H3ZM3 11h2v2H3ZM3 17h2v2H3Z',
    board: 'M3 4h18v16H3ZM9 4v16M15 4v16M5 8h2M11 8h2M17 8h2M5 12h2M11 12h2',
    play: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM10 8l6 4-6 4Z',
    sliders: 'M4 3v7m0 4v7M12 3v11m0 4v3M20 3v3m0 4v11M1 10h6v4H1ZM9 14h6v4H9ZM17 6h6v4h-6Z',
  };
  return (
    <svg
      className="h-5 w-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
