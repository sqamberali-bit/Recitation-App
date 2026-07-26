import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Sheet } from './Sheet'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<(v: boolean) => void>()

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = undefined
    setOpts(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Sheet open={!!opts} title={opts?.title} onClose={() => settle(false)}>
        {opts?.message && <p className="muted" style={{ marginBottom: 20, lineHeight: 1.6 }}>{opts.message}</p>}
        <div className="row-flex" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn--ghost" onClick={() => settle(false)}>
            {opts?.cancelLabel ?? 'Cancel'}
          </button>
          <button
            className={`btn ${opts?.danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={() => settle(true)}
          >
            {opts?.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </Sheet>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}
