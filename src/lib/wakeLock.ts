/**
 * Screen Wake Lock helper — keeps the screen on during recitation. Falls back
 * silently on browsers without the API (notably older iOS Safari). Re-acquires
 * the lock when the tab becomes visible again.
 */
import { useEffect, useRef } from 'react'

type WakeLockSentinelLike = { released: boolean; release: () => Promise<void> }

export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    if (!active) return
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
    }
    if (!nav.wakeLock) return

    let cancelled = false

    const acquire = async () => {
      try {
        const sentinel = await nav.wakeLock!.request('screen')
        if (cancelled) {
          sentinel.release().catch(() => {})
          return
        }
        sentinelRef.current = sentinel
      } catch {
        // User gesture missing / permission denied — ignore, best-effort only.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinelRef.current?.released) {
        void acquire()
      }
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      sentinelRef.current?.release().catch(() => {})
      sentinelRef.current = null
    }
  }, [active])
}
