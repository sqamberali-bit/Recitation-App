import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  IconHome,
  IconStar,
  IconClock,
  IconLayers,
  IconSettings,
  IconPlus,
  IconBook,
} from './icons'

const NAV = [
  { to: '/', label: 'Library', icon: IconHome, end: true },
  { to: '/favourites', label: 'Favourites', icon: IconStar, end: false },
  { to: '/recent', label: 'Recent', icon: IconClock, end: false },
  { to: '/browse', label: 'Browse', icon: IconLayers, end: false },
  { to: '/settings', label: 'Settings', icon: IconSettings, end: false },
]

export function AppShell() {
  const navigate = useNavigate()

  return (
    <div className="app">
      {/* Desktop side rail */}
      <aside className="sidebar">
        <div className="sidebar__brand">
          <IconBook style={{ color: 'var(--accent)' }} />
          Recitation
        </div>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon />
            {label}
          </NavLink>
        ))}
        <div className="spacer" />
        <button className="btn btn--primary btn--block" onClick={() => navigate('/editor/new')}>
          <IconPlus /> New poem
        </button>
      </aside>

      <div className="main">
        <Outlet />
      </div>

      {/* Mobile bottom nav + FAB */}
      <button className="fab" onClick={() => navigate('/editor/new')} aria-label="Add poem">
        <IconPlus />
      </button>
      <nav className="bottomnav">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
