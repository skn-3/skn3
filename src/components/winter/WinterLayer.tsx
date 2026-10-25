import { useWinterMode } from '@/lib/winterMode';
import { Snowfall } from './Snowfall';
import { SantaFlyby } from './SantaFlyby';

export function WinterLayer({ tone }: { tone: 'dark' | 'light' }) {
  const { active } = useWinterMode();
  if (!active) return null;
  return (
    <>
      <Snowfall tone={tone} />
      <SantaFlyby tone={tone} />
    </>
  );
}
