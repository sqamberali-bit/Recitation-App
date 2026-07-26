import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  message?: string
  action?: ReactNode
}

export function EmptyState({ icon = '📖', title, message, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <h3>{title}</h3>
      {message && <p style={{ maxWidth: 340, margin: '0 auto 16px' }}>{message}</p>}
      {action}
    </div>
  )
}
