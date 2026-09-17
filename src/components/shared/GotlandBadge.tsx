import { MapPin } from 'lucide-react';

/** Animerad pill som visas när ett ärende identifierats som Gotland. */
export function GotlandBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary animate-in fade-in zoom-in duration-300">
      <MapPin className="h-3 w-3" />
      Bekräftat Gotland
    </span>
  );
}

export const GOTLAND_LOCK_HINT = 'Gotland — montage hanteras av Congard';
export const CONGARD_TEAM = 'Congard';
