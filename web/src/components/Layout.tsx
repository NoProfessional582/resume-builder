import { NavLink, Outlet } from 'react-router';

const NAV = [
  {
    heading: 'Resume',
    links: [
      { to: '/template', label: 'Template' },
      { to: '/history', label: 'Work History' },
      { to: '/sections', label: 'Other Sections' },
    ],
  },
  { heading: 'Jobs', links: [{ to: '/applications', label: 'Applications' }] },
  {
    heading: 'System',
    links: [
      { to: '/runs', label: 'Agent Runs' },
      { to: '/settings', label: 'Settings' },
    ],
  },
];

export function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
        <div className="px-5 py-5 text-base font-semibold tracking-tight">Resume Builder</div>
        <nav className="space-y-5 px-3 pb-6">
          {NAV.map((group) => (
            <div key={group.heading}>
              <div className="px-2 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">{group.heading}</div>
              {group.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `block rounded-md px-2 py-1.5 text-sm ${
                      isActive ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-700 hover:bg-slate-100'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
