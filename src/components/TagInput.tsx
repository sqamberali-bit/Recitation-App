import { useState, type KeyboardEvent } from 'react'
import { IconClose } from './icons'
import { splitList } from '@/lib/text'

interface TagInputProps {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  /** Existing values for lightweight autocomplete. */
  suggestions?: string[]
}

/** Token/chip input for tags, topics, and occasions. Commits on Enter or comma. */
export function TagInput({ value, onChange, placeholder, suggestions = [] }: TagInputProps) {
  const [draft, setDraft] = useState('')

  const add = (raw: string) => {
    const parts = splitList(raw)
    if (!parts.length) return
    const merged = Array.from(new Set([...value, ...parts]))
    onChange(merged)
    setDraft('')
  }

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag))

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === '،') {
      e.preventDefault()
      add(draft)
    } else if (e.key === 'Backspace' && !draft && value.length) {
      remove(value[value.length - 1])
    }
  }

  const matches = draft
    ? suggestions.filter((s) => !value.includes(s) && s.toLowerCase().includes(draft.toLowerCase())).slice(0, 6)
    : []

  return (
    <div>
      <div className="chips" style={{ marginBottom: value.length ? 8 : 0 }}>
        {value.map((tag) => (
          <span key={tag} className="chip chip--active">
            {tag}
            <button type="button" className="chip__x" onClick={() => remove(tag)} aria-label={`Remove ${tag}`}>
              <IconClose width={13} height={13} />
            </button>
          </span>
        ))}
      </div>
      <input
        className="input"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft && add(draft)}
      />
      {matches.length > 0 && (
        <div className="chips" style={{ marginTop: 8 }}>
          {matches.map((m) => (
            <button type="button" key={m} className="chip" onClick={() => add(m)}>
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
