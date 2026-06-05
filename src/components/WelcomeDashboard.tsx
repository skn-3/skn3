import { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchVisits, fetchCases, fetchAllDeviations, fetchInsightHistory, recordInsightsShown, type CaseRow, type VisitRow } from '@/lib/supabaseClient';
import { formatAmount } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ArrowRight, TrendingUp, Flame, Calendar, Target, Sparkles, CheckCircle2, AlertTriangle, Wrench, MapPin, Clock, Volume2, VolumeX } from 'lucide-react';
import type { UserRole } from '@/lib/constants';
import { selectFromSellerData, selectFromMontorData } from '@/lib/insights/engine';
import { InsightCard } from '@/components/insights/InsightCard';
import { getSoundEnabled, setSoundEnabled } from '@/lib/insights/sound';
import { normalizeCityKey, cityDisplayName } from '@/lib/city';



interface Props {
  role: UserRole;
  onContinue: () => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function CountUp({ value, duration = 900, formatter }: { value: number; duration?: number; formatter?: (n: number) => string }) {
  const [n, setN] = useState(prefersReducedMotion() ? value : 0);
  useEffect(() => {
    if (prefersReducedMotion()) { setN(value); return; }
    const start = performance.now();
    const from = 0;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{formatter ? formatter(n) : n.toLocaleString('sv-SE')}</>;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'God natt';
  if (h < 10) return 'God morgon';
  if (h < 13) return 'Hej';
  if (h < 17) return 'God eftermiddag';
  return 'God afton';
}

function sellerTagline(): string {
  const now = new Date();
  const dow = now.getDay(); // 0=sön ... 6=lör
  const h = now.getHours();
  const isMorning = h < 13; // morgon/fm
  if (dow === 0 || dow === 6) return 'Helgcheck — så här ser veckan ut';
  if (dow === 1) return isMorning ? 'Nytt fokus, ny vecka — så här ligger du till' : 'Veckan har börjat — här är läget';
  if (dow === 5) return isMorning ? 'Fredag! Avsluta veckan starkt' : 'Veckan i siffror — bra jobbat';
  return isMorning ? 'Här är veckan så här långt' : 'Halvvägs in i veckan — så här går det';
}

const MONTOR_TAGLINES = [
  'Här är vad som väntar dig',
  'Dagens uppdrag, klart och tydligt',
  'Ett jobb i taget — så här ser dagen ut',
];

function montorTagline(): string {
  const day = Math.floor(Date.now() / 86400000);
  return MONTOR_TAGLINES[day % MONTOR_TAGLINES.length];
}

const WEEKDAYS_SV = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];

function todayStr(): string {
  return new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // mon=0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

function isoDate(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border bg-card p-5 shadow-sm animate-fade-in ${className}`}>
      {children}
    </div>
  );
}

// ============ INSIGHTS LAYER ============

type SellerInsightData = { visits: VisitRow[]; cases: CaseRow[] };
type MontorInsightData = { cases: CaseRow[]; deviations: any[]; name: string };

function InsightsLayer({
  kind, name, data,
}: { kind: 'seller'; name: string; data: SellerInsightData }
   | { kind: 'montor'; name: string; data: MontorInsightData }) {
  const [soundOn, setSoundOn] = useState(() => getSoundEnabled(name));

  const { data: history = [] } = useQuery({
    queryKey: ['insight-history', name],
    queryFn: () => fetchInsightHistory(name),
    staleTime: 5 * 60_000,
  });

  const selection = useMemo(() => {
    return kind === 'seller'
      ? selectFromSellerData(name, data as SellerInsightData, history)
      : selectFromMontorData(name, data as MontorInsightData, history);
  }, [kind, name, data, history]);

  const insights = selection.insights;

  // Logga nytt urval till servern — exakt en gång per ny selection.
  const loggedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selection.isNewSelection || !insights.length) return;
    const key = insights.map(i => i.id).sort().join('|');
    if (loggedKeyRef.current === key) return;
    loggedKeyRef.current = key;
    recordInsightsShown(name, insights.map(i => i.id));
  }, [selection.isNewSelection, insights, name]);

  if (!insights.length) return null;
  const hero = insights[0].tier === 1 ? insights[0] : null;
  const rest = hero ? insights.slice(1) : insights;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            const next = !soundOn;
            setSoundOn(next);
            setSoundEnabled(name, next);
          }}
          aria-label={soundOn ? 'Stäng av ljud' : 'Slå på ljud'}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
        >
          {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          <span className="hidden sm:inline">{soundOn ? 'Ljud på' : 'Ljud av'}</span>
        </button>
      </div>

      {hero && <InsightCard insight={hero} isHero index={0} soundEnabled={soundOn} />}

      {rest.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rest.map((ins, i) => (
            <InsightCard key={ins.id} insight={ins} index={i + (hero ? 1 : 0)} soundEnabled={soundOn} />
          ))}
        </div>
      )}
    </div>
  );
}


// ============ SELLER ============


function SellerDashboard({ name }: { name: string }) {
  const { data: visits = [], isLoading: vL } = useQuery({
    queryKey: ['welcome-visits', name],
    queryFn: () => fetchVisits({ seller: name }) as Promise<VisitRow[]>,
  });
  const { data: cases = [] } = useQuery({
    queryKey: ['welcome-cases-seller', name],
    queryFn: () => fetchCases({ seller: name }) as Promise<CaseRow[]>,
  });

  // [DIAG-WELCOME] tillfällig diagnos — ta bort när vi vet roten
  const { data: allVisits } = useQuery({
    queryKey: ['diag-all-visits'],
    queryFn: () => fetchVisits() as Promise<VisitRow[]>,
  });
  useEffect(() => {
    if (!allVisits) return;
    console.log('[DIAG-WELCOME] name (inloggad säljare):', JSON.stringify(name));
    console.log('[DIAG-WELCOME] antal visits från fetchVisits({seller:name}):', visits.length);
    console.log('[DIAG-WELCOME] totalt antal visits i systemet:', allVisits.length);
    console.log('[DIAG-WELCOME] unika seller-värden:', [...new Set(allVisits.map(v => v.seller))]);
    console.log('[DIAG-WELCOME] visits som BORDE matcha name:', allVisits.filter(v => v.seller === name).length);
    console.log('[DIAG-WELCOME] datum på senaste 5 visits:', allVisits.slice(0, 5).map(v => ({ seller: v.seller, date: v.date })));
  }, [allVisits, visits.length, name]);


  const stats = useMemo(() => {
    const now = new Date();
    const dow = now.getDay(); // 0=sun..6=sat
    const isEarlyWeek = dow >= 1 && dow <= 3; // mon-wed
    const weekStart = startOfWeek(now);
    const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate() - 30);
    const twoMonthsAgo = new Date(now); twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);

    const thisWeek = visits.filter(v => new Date(v.date) >= weekStart);
    const lastWeek = visits.filter(v => {
      const d = new Date(v.date);
      return d >= lastWeekStart && d < weekStart;
    });

    const signed = thisWeek.filter(v => v.result === 'signerat');
    const lastSigned = lastWeek.filter(v => v.result === 'signerat');
    const sumSigned = signed.reduce((s, v) => s + (Number(v.order_value) || 0), 0);
    const lastSum = lastSigned.reduce((s, v) => s + (Number(v.order_value) || 0), 0);

    // Per-week sums for "best week" + counts
    const byWeekSum = new Map<string, number>();
    const byWeekCount = new Map<string, number>();
    visits.filter(v => v.result === 'signerat').forEach(v => {
      const ws = isoDate(startOfWeek(new Date(v.date)));
      byWeekSum.set(ws, (byWeekSum.get(ws) || 0) + (Number(v.order_value) || 0));
      byWeekCount.set(ws, (byWeekCount.get(ws) || 0) + 1);
    });
    const thisWeekKey = isoDate(weekStart);
    const otherWeekSums = [...byWeekSum.entries()].filter(([k]) => k !== thisWeekKey).map(([, v]) => v);
    const maxOther = otherWeekSums.reduce((m, s) => Math.max(m, s), 0);
    const isBestWeek = sumSigned > 0 && sumSigned > maxOther;

    const weekDelta = lastSum > 0 ? Math.round(((sumSigned - lastSum) / lastSum) * 100) : null;

    // Streak: consecutive WEEKS (incl current) with at least 1 signing
    let weekStreak = 0;
    const wcur = new Date(weekStart);
    while (true) {
      const key = isoDate(wcur);
      if ((byWeekCount.get(key) || 0) > 0) {
        weekStreak++;
        wcur.setDate(wcur.getDate() - 7);
      } else break;
    }

    // Follow-ups
    const todayISO = isoDate(new Date());
    const followUps = visits.filter(v =>
      v.result === 'aterkoppla' && v.follow_up_date && isoDate(v.follow_up_date) <= todayISO && !v.lost
    ).length;

    // Insights ----
    // Top city
    const cityCount = new Map<string, number>();
    visits.filter(v => v.result === 'signerat').forEach(v => {
      const raw = (v.address || '').split(',').pop()?.replace(/\d/g, '').trim();
      const key = normalizeCityKey(raw);
      if (key) cityCount.set(key, (cityCount.get(key) || 0) + 1);
    });
    const topCityEntry = [...cityCount.entries()].sort((a, b) => b[1] - a[1])[0];
    const topCity: [string, number] | undefined = topCityEntry
      ? [cityDisplayName(topCityEntry[0]), topCityEntry[1]]
      : undefined;

    // Most common signing weekday
    const dayCount = new Array(7).fill(0);
    visits.filter(v => v.result === 'signerat').forEach(v => {
      dayCount[new Date(v.date).getDay()]++;
    });
    const totalSignedAll = dayCount.reduce((a, b) => a + b, 0);
    const bestDayIdx = dayCount.indexOf(Math.max(...dayCount));
    const bestDayShare = totalSignedAll > 0 ? dayCount[bestDayIdx] / totalSignedAll : 0;

    // Avg order value trend (last 30d vs prev 30d)
    const recent = visits.filter(v => v.result === 'signerat' && new Date(v.date) >= monthAgo && Number(v.order_value) > 0);
    const prev = visits.filter(v => {
      const d = new Date(v.date);
      return v.result === 'signerat' && d >= twoMonthsAgo && d < monthAgo && Number(v.order_value) > 0;
    });
    const avgRecent = recent.length ? recent.reduce((s, v) => s + Number(v.order_value), 0) / recent.length : 0;
    const avgPrev = prev.length ? prev.reduce((s, v) => s + Number(v.order_value), 0) / prev.length : 0;
    const avgTrend = avgPrev > 0 && avgRecent > 0 ? Math.round(((avgRecent - avgPrev) / avgPrev) * 100) : null;

    // Pick one insight (rotate by day) among those with enough data
    const insights: { icon: string; text: string }[] = [];
    if (topCity && topCity[1] >= 2) {
      insights.push({ icon: '📍', text: `${topCity[0]} är din starkaste ort — ${topCity[1]} affärer` });
    }
    if (totalSignedAll >= 5 && bestDayShare >= 0.25) {
      insights.push({ icon: '📅', text: `Du signerar oftast på ${WEEKDAYS_SV[bestDayIdx]}ar` });
    }
    if (avgTrend !== null && avgTrend > 5 && recent.length >= 2) {
      insights.push({ icon: '📈', text: `Ditt snittordervärde har ökat ${avgTrend}% senaste månaden` });
    }
    // (borttaget) all-time total — krockar med permanenta "Totalt sålt <år>"-kortet
    const dayN = Math.floor(Date.now() / 86400000);
    const insight = insights.length ? insights[dayN % insights.length] : null;

    // Milestone (round numbers)
    const milestones = [5, 10, 25, 50, 100, 200, 500];
    const nextMilestone = milestones.find(m => totalSignedAll > 0 && totalSignedAll < m && m - totalSignedAll <= 3);

    // Goal: last week's sum or 3-week avg
    const allWeekSums = [...byWeekSum.values()];
    const goalRef = lastSum > 0 ? lastSum : (allWeekSums.reduce((s, x) => s + x, 0) / Math.max(allWeekSums.length, 1));
    const goalPct = goalRef > 0 ? Math.min(100, Math.round((sumSigned / goalRef) * 100)) : 0;

    // Totalt sålt år-hittills: summa order_value på cases (seller=user) skapade i innevarande år
    const yearNow = now.getFullYear();
    const yearTotalSold = cases
      .filter(c => c.created_at && new Date(c.created_at).getFullYear() === yearNow)
      .reduce((s, c) => s + (Number(c.order_value) || 0), 0);

    return {
      visitsThisWeek: thisWeek.length,
      signedThisWeek: signed.length,
      sumSigned,
      yearTotalSold,
      currentYear: yearNow,
      isBestWeek,
      weekDelta,
      weekStreak,
      followUps,
      topCity: topCity ? { name: topCity[0], count: topCity[1] } : null,
      goalRef,
      goalPct,
      insight,
      nextMilestone,
      totalSignedAll,
      isEarlyWeek,
      dow,
    };
  }, [visits, cases]);

  if (vL) return <div className="text-center text-muted-foreground py-12">Laddar din vecka…</div>;

  const empty = visits.length === 0;

  // Zero-state encouragement (no visits this week)
  let zeroNudge: string | null = null;
  if (!empty && stats.visitsThisWeek === 0) {
    zeroNudge = stats.isEarlyWeek
      ? 'Veckan är ung — dags att boka in besök! 🚀'
      : 'Inga besök registrerade än denna vecka — det är aldrig för sent att starta. 💪';
  } else if (!empty && stats.signedThisWeek === 0 && stats.visitsThisWeek > 0) {
    zeroNudge = `Du har ${stats.visitsThisWeek} ${stats.visitsThisWeek === 1 ? 'besök' : 'besök'} igång — nästa signering är nära! ⚡`;
  }

  return (
    <div className="space-y-4">
      {empty && (
        <Card>
          <div className="text-center py-8">
            <div className="text-5xl mb-3">🚀</div>
            <h3 className="text-xl font-bold">Ny vecka, nya möjligheter!</h3>
            <p className="text-sm text-muted-foreground mt-2">Registrera ditt första besök för att se din statistik här.</p>
          </div>
        </Card>
      )}

      {!empty && (
        <>
          <InsightsLayer kind="seller" name={name} data={{ visits, cases }} />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Besök denna vecka</div>
              <div className="text-4xl font-bold mt-2 text-foreground"><CountUp value={stats.visitsThisWeek} /></div>
            </Card>
            <Card>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Signerade</div>
              <div className="text-4xl font-bold mt-2 text-primary"><CountUp value={stats.signedThisWeek} /></div>
            </Card>
            <Card>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Sålt värde</div>
              <div className="text-3xl font-bold mt-2 text-foreground">
                <CountUp value={stats.sumSigned} formatter={(n) => formatAmount(n)} />
              </div>
            </Card>
            <Card className="bg-gradient-to-br from-primary/5 to-transparent">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Totalt sålt {stats.currentYear}</div>
              <div className="text-3xl font-bold mt-2 text-primary">
                <CountUp value={stats.yearTotalSold} formatter={(n) => formatAmount(n)} />
              </div>
            </Card>
          </div>

          {zeroNudge && (
            <Card className="border-primary/40 bg-primary/5">
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-primary shrink-0" />
                <div className="font-semibold">{zeroNudge}</div>
              </div>
            </Card>
          )}

          {/* Höjdpunkter — best week / positive delta / milestone */}
          {(stats.isBestWeek || (stats.weekDelta !== null && stats.weekDelta > 0) || stats.nextMilestone) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {stats.isBestWeek && (
                <Card className="border-primary/50 bg-primary/5">
                  <div className="flex items-center gap-3">
                    <Flame className="h-7 w-7 text-orange-500 shrink-0" />
                    <div>
                      <div className="font-bold text-lg">🏆 Din bästa vecka hittills!</div>
                      <div className="text-sm text-muted-foreground">{formatAmount(stats.sumSigned)} sålt — nytt rekord.</div>
                    </div>
                  </div>
                </Card>
              )}

              {!stats.isBestWeek && stats.weekDelta !== null && stats.weekDelta > 0 && (
                <Card>
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-7 w-7 text-primary shrink-0" />
                    <div>
                      <div className="font-bold text-lg">+<CountUp value={stats.weekDelta} />% mot förra veckan</div>
                      <div className="text-sm text-muted-foreground">Förra veckan: {formatAmount(stats.goalRef)}</div>
                    </div>
                  </div>
                </Card>
              )}

              {stats.nextMilestone && (
                <Card>
                  <div className="flex items-center gap-3">
                    <Target className="h-7 w-7 text-primary shrink-0" />
                    <div>
                      <div className="font-bold">Du närmar dig {stats.nextMilestone} signerade ärenden totalt!</div>
                      <div className="text-xs text-muted-foreground">{stats.totalSignedAll} klara — {stats.nextMilestone - stats.totalSignedAll} kvar.</div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Veckostreak visas via InsightsLayer (streak_weeks_signed) för att undvika dubblett. */}

            {stats.followUps > 0 && (
              <Card className="border-orange-300 bg-orange-50/50 dark:bg-orange-950/20">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-6 w-6 text-orange-600" />
                    <div>
                      <div className="font-bold"><CountUp value={stats.followUps} /> återkopplingar väntar</div>
                      <div className="text-xs text-muted-foreground">Idag eller försenade</div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {stats.goalRef > 0 && (
              <Card>
                <div className="flex items-center gap-3 mb-2">
                  <Target className="h-5 w-5 text-primary" />
                  <div className="font-semibold text-sm">Veckans mål (förra veckans nivå)</div>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-700 motion-reduce:transition-none"
                    style={{ width: `${stats.goalPct}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-1.5">{stats.goalPct}% av {formatAmount(stats.goalRef)}</div>
              </Card>
            )}

            {stats.insight && (
              <Card className="bg-gradient-to-br from-primary/5 to-transparent">
                <div className="flex items-start gap-3">
                  <div className="text-2xl shrink-0">💡</div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Visste du?</div>
                    <div className="font-semibold">
                      <span className="mr-1.5">{stats.insight.icon}</span>{stats.insight.text}
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============ MONTOR ============

function MontorDashboard({ name }: { name: string }) {
  const { data: cases = [], isLoading: cL } = useQuery({
    queryKey: ['welcome-cases-montor', name],
    queryFn: async () => {
      const [byTeam, byKm] = await Promise.all([
        fetchCases({ team: name }),
        fetchCases({}).then((all) => all.filter((c: CaseRow) => c.km_team === name)),
      ]);
      const map = new Map<string, CaseRow>();
      [...byTeam, ...byKm].forEach((c: CaseRow) => map.set(c.id, c));
      return [...map.values()];
    },
  });
  const { data: allDeviations = [] } = useQuery({ queryKey: ['welcome-devs'], queryFn: fetchAllDeviations });

  const stats = useMemo(() => {
    const today = isoDate(new Date());
    const now = new Date();
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const weekStart = startOfWeek(now);

    const todayEvents = cases.filter(c =>
      (c.montage_date === today && c.team === name) ||
      (c.km_date === today && c.km_team === name)
    ).map(c => ({
      caseRow: c,
      kind: (c.montage_date === today && c.team === name) ? 'Montage' : 'KM',
      time: c.montage_date === today ? c.montage_time : c.km_time,
    }));

    const upcoming = cases.flatMap(c => {
      const items: Array<{ caseRow: CaseRow; kind: string; date: string; time: string | null }> = [];
      if (c.team === name && c.montage_date && c.montage_date > today && new Date(c.montage_date) <= in7) {
        items.push({ caseRow: c, kind: 'Montage', date: c.montage_date, time: c.montage_time });
      }
      if (c.km_team === name && c.km_date && c.km_date > today && new Date(c.km_date) <= in7) {
        items.push({ caseRow: c, kind: 'KM', date: c.km_date, time: c.km_time });
      }
      if (c.team === name && c.delivery_date && c.delivery_date > today && new Date(c.delivery_date) <= in7) {
        items.push({ caseRow: c, kind: 'Leverans', date: c.delivery_date, time: c.delivery_time });
      }
      return items;
    }).sort((a, b) => a.date.localeCompare(b.date));

    // Klara denna vecka (montage_klart updated this week)
    const klaraThisWeek = cases.filter(c =>
      c.team === name && c.status === 'montage_klart' &&
      new Date(c.updated_at) >= weekStart
    ).length;

    // Quality: last 5 cases marked klart/fakturerad, count w/ deviations
    const finishedCases = cases
      .filter(c => c.team === name && ['montage_klart', 'fakturerad'].includes(c.status))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 5);
    const finishedIds = new Set(finishedCases.map(c => c.id));
    const cleanCount = finishedCases.filter(c => !allDeviations.some(d => d.case_id === c.id)).length;
    const allClean = finishedCases.length >= 3 && cleanCount === finishedCases.length;

    const openDeviations = allDeviations.filter(d => !d.resolved && cases.some(c => c.id === d.case_id && c.team === name)).length;

    // Warnings on upcoming
    const carryWarnings = upcoming.filter(u => u.caseRow.carry_help_needed && u.kind === 'Montage');
    const scheduledWarnings = upcoming.filter(u => u.caseRow.scheduled_delivery && u.kind === 'Leverans');

    return {
      todayEvents,
      upcoming: upcoming.slice(0, 8),
      klaraThisWeek,
      finishedCount: finishedCases.length,
      allClean,
      openDeviations,
      carryWarnings,
      scheduledWarnings,
    };
  }, [cases, allDeviations, name]);

  if (cL) return <div className="text-center text-muted-foreground py-12">Laddar din dag…</div>;

  return (
    <div className="space-y-4">
      <InsightsLayer kind="montor" name={name} data={{ cases, deviations: allDeviations, name }} />

      <Card className={stats.todayEvents.length > 0 ? 'border-primary/40 bg-primary/5' : ''}>
        <div className="flex items-center gap-3 mb-3">
          <Wrench className="h-6 w-6 text-primary" />
          <div className="font-bold text-lg">
            Idag har du <CountUp value={stats.todayEvents.length} /> {stats.todayEvents.length === 1 ? 'jobb' : 'jobb'}
          </div>
        </div>
        {stats.todayEvents.length === 0 && (
          <div className="text-sm text-muted-foreground">Inga inbokade jobb idag. Njut! ☕</div>
        )}
        {stats.todayEvents.length > 0 && (
          <ul className="space-y-2">
            {stats.todayEvents.map((e, i) => (
              <li key={i} className="flex items-center gap-2 text-sm border-l-2 border-primary pl-3 py-1">
                <span className="font-semibold text-primary">{e.kind}</span>
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{e.caseRow.address}</span>
                {e.time && (
                  <span className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Clock className="h-3 w-3" />{e.time.slice(0, 5)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Klara denna vecka</div>
          <div className="text-4xl font-bold mt-2 text-primary"><CountUp value={stats.klaraThisWeek} /></div>
          {stats.klaraThisWeek > 0 && (
            <div className="text-sm text-foreground mt-1">Du har klarat {stats.klaraThisWeek} montage! 💪</div>
          )}
        </Card>

        {stats.allClean && (
          <Card className="border-primary/50 bg-primary/5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-7 w-7 text-primary shrink-0" />
              <div>
                <div className="font-bold">✅ {stats.finishedCount} jobb utan reklamation</div>
                <div className="text-xs text-muted-foreground">Toppkvalitet — fortsätt så!</div>
              </div>
            </div>
          </Card>
        )}

        {stats.openDeviations > 0 && (
          <Card className="border-orange-300">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-orange-600" />
              <div>
                <div className="font-bold"><CountUp value={stats.openDeviations} /> öppna avvikelser</div>
                <div className="text-xs text-muted-foreground">På dina jobb</div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {(stats.carryWarnings.length > 0 || stats.scheduledWarnings.length > 0) && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <div className="font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" /> Förvarningar
          </div>
          <ul className="space-y-1 text-sm">
            {stats.carryWarnings.map((u, i) => (
              <li key={`c-${i}`}>⚠ Bärhjälp behövs {u.date} — {u.caseRow.address}</li>
            ))}
            {stats.scheduledWarnings.map((u, i) => (
              <li key={`s-${i}`}>⏱ Tidsstyrd leverans {u.date} — {u.caseRow.address}</li>
            ))}
          </ul>
        </Card>
      )}

      {stats.upcoming.length > 0 && (
        <Card>
          <div className="font-semibold mb-3 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" /> Kommande 7 dagar
          </div>
          <ul className="space-y-1.5 text-sm">
            {stats.upcoming.map((u, i) => (
              <li key={i} className="flex items-center gap-2 py-1 border-b border-border/50 last:border-0">
                <span className="text-xs font-mono text-muted-foreground w-20 shrink-0">{u.date}</span>
                <span className="font-semibold text-primary text-xs w-16 shrink-0">{u.kind}</span>
                <span className="flex-1 truncate">{u.caseRow.address}</span>
                {u.time && <span className="text-muted-foreground text-xs">{u.time.slice(0, 5)}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ============ MAIN ============

export function WelcomeDashboard({ role, onContinue }: Props) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <div className="mb-8 animate-fade-in">
          <div className="text-sm text-muted-foreground capitalize">{todayStr()}</div>
          <h1 className="text-3xl sm:text-4xl font-bold mt-1 text-foreground">
            {greeting()}, {role.name}! 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            {role.type === 'seller' ? sellerTagline() : montorTagline()}
          </p>
        </div>

        {role.type === 'seller'
          ? <SellerDashboard name={role.name} />
          : <MontorDashboard name={role.name} />}

        <div className="mt-8 flex justify-center">
          <Button size="lg" onClick={onContinue} className="gap-2">
            Till pipeline <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
