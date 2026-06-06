import { useEffect, useState } from 'react';
import { getSignedImageUrl, type SignedBucket } from '@/lib/signedImage';
import { cn } from '@/lib/utils';

interface SignedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  value: string | null | undefined;
  bucket?: SignedBucket;
}

/**
 * Render an image stored privately in Supabase Storage.
 * `value` can be either an object path (new format) or an old public URL —
 * both are normalized and signed via getSignedImageUrl.
 */
export function SignedImage({ value, bucket = 'case-images', className, alt = '', ...rest }: SignedImageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!value) {
      setUrl(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getSignedImageUrl(value, bucket).then(u => {
      if (!alive) return;
      setUrl(u);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [value, bucket]);

  if (loading || !url) {
    return <div className={cn('bg-muted animate-pulse', className)} aria-label={loading ? 'Laddar bild' : 'Ingen bild'} />;
  }
  return <img src={url} alt={alt} className={className} {...rest} />;
}
