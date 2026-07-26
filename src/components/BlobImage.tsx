import { useEffect, useState, type ImgHTMLAttributes } from 'react'

/**
 * Create a temporary object URL for a Blob and revoke it on unmount or when the
 * blob changes. Every place that renders media out of IndexedDB goes through
 * this hook so no revoke is ever forgotten.
 */
export function useObjectUrl(blob: Blob | null | undefined): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) {
      setUrl(undefined)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

interface BlobImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  blob: Blob | null | undefined
  /** Height of the placeholder shown while the URL is being created. */
  placeholderHeight?: number | string
}

/** <img> backed by an in-memory Blob (offline media from IndexedDB). */
export function BlobImage({ blob, alt = '', placeholderHeight = '100%', style, ...rest }: BlobImageProps) {
  const url = useObjectUrl(blob)
  if (!url) {
    return <div className="skeleton" style={{ width: '100%', height: placeholderHeight }} aria-hidden />
  }
  return <img src={url} alt={alt} style={style} {...rest} />
}
