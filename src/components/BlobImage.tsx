import { useEffect, useState, type ImgHTMLAttributes } from 'react'

/** Create a temporary object URL for a Blob and revoke it on unmount/change. */
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
}

/** <img> backed by an in-memory Blob (offline media from IndexedDB). */
export function BlobImage({ blob, alt = '', ...rest }: BlobImageProps) {
  const url = useObjectUrl(blob)
  if (!url) return <div className="skeleton" style={{ width: '100%', height: '100%' }} aria-hidden />
  return <img src={url} alt={alt} {...rest} />
}
