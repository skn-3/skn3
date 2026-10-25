import { useWinterMode } from '@/lib/winterMode';
import { SantaHat } from './SantaHat';

export function LogoWithHat({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const { active } = useWinterMode();
  return (
    <span className="relative inline-block shrink-0 leading-none">
      <img src={src} alt={alt} className={`block ${className ?? ''}`} />
      {active && (
        <SantaHat
          style={{
            position: 'absolute', top: '-30%', right: '-24%', width: '70%', height: 'auto',
            transform: 'rotate(20deg)', transformOrigin: '50% 100%',
          }}
        />
      )}
    </span>
  );
}
