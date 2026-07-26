/** Inline SVG icon set (Lucide-style, 24×24, currentColor stroke). */
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

/**
 * Base icon. Always emits concrete width/height: an <svg> with only a viewBox
 * is a replaced element that falls back to a 300×150 intrinsic size, which
 * blows out any flex row it sits in. Passing just `width` keeps it square.
 */
function Svg({ children, width, height, ...props }: P & { children: React.ReactNode }) {
  const w = width ?? 24
  const h = height ?? w
  return (
    <svg
      viewBox="0 0 24 24"
      width={w}
      height={h}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconSearch = (p: P) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Svg>
)
export const IconHome = (p: P) => (
  <Svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></Svg>
)
export const IconBook = (p: P) => (
  <Svg {...p}><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" /><path d="M18 3v18" /></Svg>
)
export const IconStar = (p: P) => (
  <Svg {...p}><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9z" /></Svg>
)
export const IconStarFill = (p: P) => (
  <Svg {...p} fill="currentColor" stroke="none"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9z" /></Svg>
)
export const IconClock = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
)
export const IconGrid = (p: P) => (
  <Svg {...p}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></Svg>
)
export const IconLayers = (p: P) => (
  <Svg {...p}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></Svg>
)
export const IconSettings = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.7 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1A1.6 1.6 0 0 0 21 10h.1a2 2 0 1 1 0 4H21a1.6 1.6 0 0 0-1.6 1Z" /></Svg>
)
export const IconPlus = (p: P) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
)
export const IconMinus = (p: P) => (<Svg {...p}><path d="M5 12h14" /></Svg>)
export const IconBack = (p: P) => (
  <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>
)
export const IconEdit = (p: P) => (
  <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>
)
export const IconTrash = (p: P) => (
  <Svg {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></Svg>
)
export const IconCamera = (p: P) => (
  <Svg {...p}><path d="M4 8h3l2-2.5h6L18 8h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" /><circle cx="12" cy="13" r="3.5" /></Svg>
)
export const IconImage = (p: P) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5L5 21" /></Svg>
)
export const IconClose = (p: P) => (<Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>)
export const IconSun = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
)
export const IconMoon = (p: P) => (
  <Svg {...p}><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" /></Svg>
)
export const IconDownload = (p: P) => (
  <Svg {...p}><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" /></Svg>
)
export const IconUpload = (p: P) => (
  <Svg {...p}><path d="M12 21V9" /><path d="m7 13 5-5 5 5" /><path d="M5 3h14" /></Svg>
)
export const IconExpand = (p: P) => (
  <Svg {...p}><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" /></Svg>
)
export const IconShrink = (p: P) => (
  <Svg {...p}><path d="M8 3v5H3M16 3v5h5M16 21v-5h5M8 21v-5H3" /></Svg>
)
export const IconPlay = (p: P) => (<Svg {...p}><path d="M7 5v14l11-7z" fill="currentColor" stroke="none" /></Svg>)
export const IconPause = (p: P) => (<Svg {...p}><rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" /></Svg>)
export const IconTextSize = (p: P) => (
  <Svg {...p}><path d="M4 7V5h10v2M9 5v14M7 19h4" /><path d="M14 12V11h6v1M17 11v8M15.5 19h3" /></Svg>
)
export const IconSparkles = (p: P) => (
  <Svg {...p}><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8Z" /><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9Z" /></Svg>
)
export const IconCopy = (p: P) => (
  <Svg {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>
)
export const IconFile = (p: P) => (
  <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Svg>
)
export const IconTag = (p: P) => (
  <Svg {...p}><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></Svg>
)
export const IconFilter = (p: P) => (
  <Svg {...p}><path d="M3 5h18l-7 8v6l-4 2v-8z" /></Svg>
)
export const IconCheck = (p: P) => (<Svg {...p}><path d="m5 12 5 5L20 7" /></Svg>)
export const IconChevron = (p: P) => (<Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>)
export const IconUser = (p: P) => (
  <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>
)
export const IconList = (p: P) => (
  <Svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Svg>
)
export const IconWand = (p: P) => (
  <Svg {...p}><path d="M15 4V2M15 10V8M12.5 6.5h-2M19.5 6.5h-2M6 21 21 6l-3-3L3 18z" /></Svg>
)
export const IconGlobe = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></Svg>
)
export const IconCloud = (p: P) => (
  <Svg {...p}><path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 6.5 19z" /></Svg>
)
