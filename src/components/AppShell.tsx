import { useState } from 'react'
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
import { useLibrary } from '@/store/library'

const NAV = [
  { to: '/', label: 'Library', icon: IconHome, end: true },
  { to: '/favourites', label: 'Favourites', icon: IconStar, end: false },
  { to: '/recent', label: 'Recent', icon: IconClock, end: false },
  { to: '/browse', label: 'Browse', icon: IconLayers, end: false },
  { to: '/settings', label: 'Settings', icon: IconSettings, end: false },
]

function SidebarCategories() {
  const { facets } = useLibrary()
  const [open, setOpen] = useState(true)
  const cats = facets.categories

  if (!cats.length) return null

  return (
    <div className="sidebar__section">
      <button
        className="sidebar__section-head"
        onClick={() => setOpen(!open)}
      >
        <span>Categories</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="sidebar__cats">
          {cats.map((c) => (
            <NavLink
              key={c.value}
              to={`/browse/results?category=${encodeURIComponent(c.value)}&label=${encodeURIComponent(c.value)}`}
              className="sidebar__cat"
            >
              <span className="sidebar__cat-name" dir="auto">{c.value}</span>
              <span className="sidebar__cat-count">{c.count}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

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
        <SidebarCategories />
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
