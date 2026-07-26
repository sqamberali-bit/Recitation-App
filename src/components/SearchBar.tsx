import { useEffect, useRef } from 'react'
import { IconSearch, IconClose } from './icons'

interface SearchBarProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}

export function SearchBar({ value, onChange, placeholder = 'Search…', autoFocus }: SearchBarProps) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  return (
    <div className="searchbar">
      <IconSearch />
      <input
        ref={ref}
        type="search"
        inputMode="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search poems"
      />
      {value && (
        <button className="iconbtn" style={{ width: 28, height: 28 }} onClick={() => onChange('')} aria-label="Clear search">
          <IconClose width={18} />
        </button>
      )}
    </div>
  )
}
