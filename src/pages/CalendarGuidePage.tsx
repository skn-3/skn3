import { useCallback, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Brand } from '@/components/AppHeader';
import { CalendarGuide } from '@/components/calendar/CalendarGuide';
import { calendarLinks } from '@/hooks/useCalendar';
import { detectPlatform } from '@/lib/calendar/platform';
import type { ConnectionRow } from '@/lib/calendarFeed';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

interface FeedInfo { name: string; connected: boolean; last_client: string | null; last_fetched_at: string | null }

class InvalidToken extends Error {}

async function fetchInfo(token: string): Promise<FeedInfo> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/calendar-ics?token=${encodeURIComponent(token)}&info=1`, {
    headers: { apikey: ANON_KEY },
  });
  if (res.status === 404 || res.status === 400) throw new InvalidToken();
  if (!res.ok) throw new Error(`Status ${res.status}`);
  return (await res.json()) as FeedInfo;
}

function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    const prevTitle = document.title;
    document.title = 'Lägg till schemat i kalendern – SmartKlimat N3prenad';
    return () => { meta.remove(); document.title = prevTitle; };
  }, []);
}

/** Publik guidesida /kalender/:token. Visar inga uppgifter om ärenden. */
export default function CalendarGuidePage() {
  useNoIndex();
  const { token = '' } = useParams<{ token: string }>();
  const info = useQuery({ queryKey: ['calendar-info', token], enabled: !!token, retry: false, queryFn: () => fetchInfo(token) });
  const links = calendarLinks(token);
  const platform = useMemo(() => detectPlatform(navigator.userAgent), []);
  const readStatus = useCallback(async (): Promise<ConnectionRow | null> => {
    const i = await fetchInfo(token);
    return { last_client: i.last_client, last_fetched_at: i.last_fetched_at };
  }, [token]);

  return (
    <div className="min-h-screen bg-background">
      <header className="safe-top bg-ink-deep px-4 py-3 text-white"><div className="mx-auto max-w-xl"><Brand compact /></div></header>
      <main className="mx-auto max-w-xl px-5 py-6">
        {info.isLoading ? (
          <p className="flex items-center gap-2 text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />Hämtar...</p>
        ) : info.isError ? (
          <div className="rounded-xl border border-border bg-card p-5">
            <h1 className="font-display text-xl font-bold">{info.error instanceof InvalidToken ? 'Länken gäller inte längre. Be kontoret om en ny.' : 'Guiden kunde inte laddas. Försök igen om en stund.'}</h1>
          </div>
        ) : info.data ? (
          <CalendarGuide
            name={info.data.name}
            team={false}
            feedUrl={links.feedUrl}
            guideUrl={links.guideUrl}
            initialPlatform={platform}
            preview={[]}
            upcomingCount={null}
            readStatus={readStatus}
            onShowSchedule={() => { window.location.href = '/'; }}
          />
        ) : null}
      </main>
    </div>
  );
}
