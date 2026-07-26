import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getSettings, saveSettings } from '@/db/repository'
import { DEFAULT_SETTINGS, type AppSettings } from '@/types'

interface SettingsContextValue {
  settings: AppSettings
  ready: boolean
  update: (patch: Partial<AppSettings>) => Promise<void>
  resolvedTheme: 'light' | 'dark'
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    let alive = true
    getSettings().then((s) => {
      if (alive) {
        setSettings(s)
        setReady(true)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  // Track OS theme so `theme: 'system'` stays live.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme: 'light' | 'dark' =
    settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme

  // Reflect theme + font choices onto <html> for CSS to consume.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = resolvedTheme
    root.dataset.urduFont = settings.urduFont
    const meta = document.querySelector('meta[name="theme-color"]:not([media])')
    if (meta) meta.setAttribute('content', resolvedTheme === 'dark' ? '#0b1220' : '#0f766e')
  }, [resolvedTheme, settings.urduFont])

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
    await saveSettings(patch)
  }, [])

  const value = useMemo(
    () => ({ settings, ready, update, resolvedTheme }),
    [settings, ready, update, resolvedTheme],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
