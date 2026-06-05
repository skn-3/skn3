// Insight engine — pure helpers. Easy to extend: add a generator to SELLER_GENERATORS
// or MONTOR_GENERATORS. Each returns InsightCandidate | null.

import type { CaseRow, VisitRow, DeviationRow } from '@/lib/supabaseClient';

export type AnimationKind =
  | 'laser' | 'fire' | 'shimmer' | 'lockon' | 'rise' | 'rocket' | 'confetti' | 'none';

export type Tier = 1 | 2 | 3 | 4;

export interface InsightCandidate {
  id: string;
  tier: Tier;
  category: string;
  score: number;
  emoji: string;
  title: string;
  subtitle?: string;
  animation: AnimationKind;
  /** Key number to highlight (for lockon / shimmer star burst) */
  highlight?: string;
}

export interface SellerData {
  visits: VisitRow[];
  cases: CaseRow[];
}

export interface MontorData {
  cases: CaseRow[];
  deviations: DeviationRow[];
  name: string;
}

type SellerGenerator = (d: SellerData) => InsightCandidate | null;
type MontorGenerator = (d: MontorData) => InsightCandidate | null;

// ============ helpers ============

const DAY = 86_400_000;

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

function isoDate(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

function isoWeekKey(d: Date | string): string {
  return isoDate(startOfWeek(new Date(d)));
}

function extractCity(address: string | null | undefined): string | null {
  if (!address) return null;
  const last = address.split(',').pop()?.replace(/\d/g, '').trim();
  return last || null;
}

function fmtKr(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace('.', ',')} mkr`;
  return `${Math.round(n).toLocaleString('sv-SE')} kr`;
}

const WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];

// Magnitude scoring helper: 0..1 → 0..40
function magScore(magnitude: number) {
  return Math.min(40, Math.max(0, magnitude * 40));
}
function recencyScore(daysAgo: number) {
  // recent events score higher
  if (daysAgo <= 1) return 30;
  if (daysAgo <= 3) return 20;
  if (daysAgo <= 7) return 12;
  return 5;
}

// ============ SELLER GENERATORS ============

const SELLER_GENERATORS: SellerGenerator[] = [
  // ---- REKORD (tier 1) ----
  ({ visits }) => {
    // flest besök på en vecka — kräver minst 3 olika veckor med data
    if (visits.length < 15) return null;
    const byWeek = new Map<string, number>();
    visits.forEach(v => {
      const k = isoWeekKey(v.date);
      byWeek.set(k, (byWeek.get(k) || 0) + 1);
    });
    if (byWeek.size < 3) return null;
    const thisKey = isoWeekKey(new Date());
    const thisCount = byWeek.get(thisKey) || 0;
    const others = [...byWeek.entries()].filter(([k]) => k !== thisKey).map(([, n]) => n);
    const maxOther = others.length ? Math.max(...others) : 0;
    if (thisCount <= maxOther || thisCount < 3) return null;
    return {
      id: 'record_week_visits',
      tier: 1, category: 'record',
      score: 90 + magScore((thisCount - maxOther) / Math.max(maxOther, 1)),
      emoji: '🏆',
      title: `${thisCount} besök denna vecka — nytt rekord!`,
      subtitle: `Tidigare bästa: ${maxOther}`,
      animation: 'laser',
      highlight: String(thisCount),
    };
  },

  ({ visits }) => {
    // flest signeringar på en vecka
    if (visits.length < 15) return null;
    const signed = visits.filter(v => v.result === 'signerat');
    if (signed.length < 3) return null;
    const byWeek = new Map<string, number>();
    signed.forEach(v => {
      const k = isoWeekKey(v.date);
      byWeek.set(k, (byWeek.get(k) || 0) + 1);
    });
    if (byWeek.size < 3) return null;
    const thisKey = isoWeekKey(new Date());
    const thisCount = byWeek.get(thisKey) || 0;
    const others = [...byWeek.entries()].filter(([k]) => k !== thisKey).map(([, n]) => n);
    const maxOther = others.length ? Math.max(...others) : 0;
    if (thisCount <= maxOther || thisCount < 2) return null;
    return {
      id: 'record_week_signed',
      tier: 1, category: 'record',
      score: 92 + magScore((thisCount - maxOther) / Math.max(maxOther, 1)),
      emoji: '🏆',
      title: `${thisCount} signeringar denna vecka — nytt rekord!`,
      subtitle: `Tidigare bästa: ${maxOther}`,
      animation: 'laser',
      highlight: String(thisCount),
    };
  },

  ({ visits }) => {
    // högsta veckovärde
    if (visits.length < 15) return null;
    const signed = visits.filter(v => v.result === 'signerat' && Number(v.order_value) > 0);
    const byWeek = new Map<string, number>();
    signed.forEach(v => {
      const k = isoWeekKey(v.date);
      byWeek.set(k, (byWeek.get(k) || 0) + (Number(v.order_value) || 0));
    });
    if (byWeek.size < 3) return null;
    const thisKey = isoWeekKey(new Date());
    const thisSum = byWeek.get(thisKey) || 0;
    const others = [...byWeek.entries()].filter(([k]) => k !== thisKey).map(([, n]) => n);
    const maxOther = others.length ? Math.max(...others) : 0;
    if (thisSum <= maxOther || thisSum <= 0) return null;
    return {
      id: 'record_week_value',
      tier: 1, category: 'record',
      score: 95,
      emoji: '🏆',
      title: `${fmtKr(thisSum)} såld denna vecka — nytt rekord!`,
      subtitle: `Tidigare bästa: ${fmtKr(maxOther)}`,
      animation: 'laser',
      highlight: fmtKr(thisSum),
    };
  },

  ({ visits }) => {
    // största enskilda affär — bara om den hände senaste 7 dagarna
    if (visits.length < 15) return null;
    const withVal = visits.filter(v => v.result === 'signerat' && Number(v.order_value) > 0);
    if (withVal.length < 3) return null;
    const top = [...withVal].sort((a, b) => Number(b.order_value) - Number(a.order_value));
    const winner = top[0];
    const second = Number(top[1]?.order_value) || 0;
    const winVal = Number(winner.order_value);
    const ageDays = (Date.now() - new Date(winner.date).getTime()) / DAY;
    if (ageDays > 7) return null;
    if (winVal <= second) return null;
    return {
      id: 'record_biggest_deal',
      tier: 1, category: 'record',
      score: 88 + recencyScore(ageDays),
      emoji: '💎',
      title: `Din största affär någonsin: ${fmtKr(winVal)}`,
      subtitle: winner.customer_name ? `Hos ${winner.customer_name}` : undefined,
      animation: 'laser',
      highlight: fmtKr(winVal),
    };
  },

  // ---- STREAKS (tier 1-2) ----
  ({ visits }) => {
    // veckor i rad med signering
    const signed = visits.filter(v => v.result === 'signerat');
    if (signed.length < 3) return null;
    const weekSet = new Set(signed.map(v => isoWeekKey(v.date)));
    let streak = 0;
    const cur = startOfWeek(new Date());
    while (weekSet.has(isoDate(cur))) {
      streak++;
      cur.setDate(cur.getDate() - 7);
    }
    if (streak < 3) return null;
    return {
      id: 'streak_weeks_signed',
      tier: streak >= 5 ? 1 : 2, category: 'streak',
      score: 60 + Math.min(30, streak * 4),
      emoji: '🔥',
      title: `${streak} veckor i rad med signering`,
      subtitle: 'Håll igång streaken!',
      animation: 'fire',
      highlight: String(streak),
    };
  },

  ({ visits }) => {
    // dagar i rad med besök
    if (visits.length < 10) return null;
    const daySet = new Set(visits.map(v => isoDate(v.date)));
    let streak = 0;
    const cur = new Date(); cur.setHours(0, 0, 0, 0);
    while (daySet.has(isoDate(cur))) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    }
    if (streak < 3) return null;
    // räkna personligt rekord
    const sortedDays = [...daySet].sort();
    let best = 0, run = 0, prev: string | null = null;
    sortedDays.forEach(d => {
      if (prev) {
        const pd = new Date(prev); pd.setDate(pd.getDate() + 1);
        if (isoDate(pd) === d) run++;
        else run = 1;
      } else run = 1;
      if (run > best) best = run;
      prev = d;
    });
    const isRecord = streak >= best && streak >= 4;
    return {
      id: 'streak_days_visits',
      tier: isRecord ? 1 : 2, category: 'streak',
      score: 55 + Math.min(25, streak * 3) + (isRecord ? 15 : 0),
      emoji: '🔥',
      title: isRecord
        ? `${streak} dagar i rad med besök — nytt rekord!`
        : `${streak} dagar i rad med besök`,
      subtitle: !isRecord ? `Ditt rekord: ${best}` : undefined,
      animation: 'fire',
      highlight: String(streak),
    };
  },

  // ---- HIT RATE (tier 2) ----
  ({ visits }) => {
    // perfekt hit rate i ort senaste 30d
    const monthAgo = Date.now() - 30 * DAY;
    const recent = visits.filter(v => new Date(v.date).getTime() >= monthAgo);
    const byCity = new Map<string, { total: number; signed: number }>();
    recent.forEach(v => {
      const c = extractCity(v.address);
      if (!c) return;
      const cur = byCity.get(c) || { total: 0, signed: 0 };
      cur.total++;
      if (v.result === 'signerat') cur.signed++;
      byCity.set(c, cur);
    });
    const perfect = [...byCity.entries()]
      .filter(([, s]) => s.total >= 3 && s.signed === s.total)
      .sort((a, b) => b[1].total - a[1].total)[0];
    if (!perfect) return null;
    return {
      id: `hitrate_perfect_${perfect[0]}`,
      tier: 2, category: 'hitrate',
      score: 70 + perfect[1].total * 3,
      emoji: '🎯',
      title: `${perfect[1].signed}/${perfect[1].total} i ${perfect[0]} — 100%`,
      subtitle: 'Perfekt hit rate senaste 30 dagarna',
      animation: 'lockon',
      highlight: '100%',
    };
  },

  // ---- MILESTONES ----
  ({ visits }) => {
    const signed = visits.filter(v => v.result === 'signerat');
    const milestones = [10, 25, 50, 100, 200, 500];
    const passed = milestones.filter(m => signed.length >= m);
    // bara om vi nyligen passerade (senaste signed-ärendet pushade oss över)
    if (passed.length === 0) return null;
    const last = passed[passed.length - 1];
    if (signed.length > last + 2) {
      // upcoming
      const next = milestones.find(m => m > signed.length);
      if (next && next - signed.length <= 3) {
        return {
          id: `milestone_signed_near_${next}`,
          tier: 2, category: 'milestone',
          score: 60 + (4 - (next - signed.length)) * 5,
          emoji: '🎯',
          title: `${next - signed.length} kvar till ${next} signerade affärer`,
          subtitle: `Du har ${signed.length} hittills`,
          animation: 'none',
        };
      }
      return null;
    }
    return {
      id: `milestone_signed_passed_${last}`,
      tier: 1, category: 'milestone',
      score: 80 + Math.log10(last) * 5,
      emoji: '🌟',
      title: `${last} signerade affärer passerade!`,
      subtitle: 'En milstolpe värd att fira',
      animation: 'shimmer',
      highlight: String(last),
    };
  },

  ({ visits }) => {
    // Total värde i år — milstolpe
    const year = new Date().getFullYear();
    const total = visits
      .filter(v => v.result === 'signerat' && new Date(v.date).getFullYear() === year)
      .reduce((s, v) => s + (Number(v.order_value) || 0), 0);
    const tiers = [500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000];
    const passed = tiers.filter(t => total >= t);
    if (passed.length === 0) {
      const next = tiers.find(t => total > t * 0.85 && total < t);
      if (!next) return null;
      const pct = Math.round((total / next) * 100);
      return {
        id: `milestone_year_value_near_${next}`,
        tier: 2, category: 'milestone',
        score: 55 + (pct - 85),
        emoji: '💰',
        title: `${pct}% av ${fmtKr(next)} i år`,
        subtitle: `Du är på ${fmtKr(total)}`,
        animation: 'none',
      };
    }
    return null;
  },

  // ---- GEO ----
  ({ visits }) => {
    const signed = visits.filter(v => v.result === 'signerat');
    if (signed.length < 5) return null;
    // ny ort senaste 14 dagarna
    const cutoff = Date.now() - 14 * DAY;
    const olderCities = new Set(
      signed.filter(v => new Date(v.date).getTime() < cutoff).map(v => extractCity(v.address)).filter(Boolean) as string[]
    );
    const newOnes = signed
      .filter(v => new Date(v.date).getTime() >= cutoff)
      .map(v => ({ city: extractCity(v.address), date: v.date }))
      .filter(x => x.city && !olderCities.has(x.city)) as { city: string; date: string }[];
    if (!newOnes.length) return null;
    const winner = newOnes.sort((a, b) => b.date.localeCompare(a.date))[0];
    const ageDays = (Date.now() - new Date(winner.date).getTime()) / DAY;
    return {
      id: `geo_new_city_${winner.city}`,
      tier: 2, category: 'geo',
      score: 65 + recencyScore(ageDays),
      emoji: '🚀',
      title: `Första affären i ${winner.city}!`,
      subtitle: 'Ny ort erövrad',
      animation: 'rocket',
      highlight: winner.city,
    };
  },

  ({ visits }) => {
    // starkaste ort (volym)
    const signed = visits.filter(v => v.result === 'signerat');
    if (signed.length < 6) return null;
    const cityCount = new Map<string, number>();
    signed.forEach(v => {
      const c = extractCity(v.address); if (c) cityCount.set(c, (cityCount.get(c) || 0) + 1);
    });
    const top = [...cityCount.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top || top[1] < 3) return null;
    return {
      id: `geo_top_city_${top[0]}`,
      tier: 3, category: 'geo',
      score: 40 + top[1] * 2,
      emoji: '📍',
      title: `${top[0]} är din starkaste ort`,
      subtitle: `${top[1]} signerade affärer`,
      animation: 'none',
    };
  },

  // ---- TREND ----
  ({ visits }) => {
    const signed = visits.filter(v => v.result === 'signerat');
    if (signed.length < 6) return null;
    const wkStart = startOfWeek(new Date());
    const lastStart = new Date(wkStart); lastStart.setDate(lastStart.getDate() - 7);
    const sumIn = (from: Date, to: Date) =>
      signed.filter(v => {
        const d = new Date(v.date);
        return d >= from && d < to;
      }).reduce((s, v) => s + (Number(v.order_value) || 0), 0);
    const thisSum = sumIn(wkStart, new Date(wkStart.getTime() + 7 * DAY));
    const lastSum = sumIn(lastStart, wkStart);
    if (lastSum <= 0 || thisSum <= lastSum) return null;
    const pct = Math.round(((thisSum - lastSum) / lastSum) * 100);
    if (pct < 10) return null;
    return {
      id: 'trend_week_up',
      tier: 2, category: 'trend',
      score: 55 + Math.min(25, pct / 4),
      emoji: '📈',
      title: `+${pct}% mot förra veckan`,
      subtitle: `${fmtKr(thisSum)} vs ${fmtKr(lastSum)}`,
      animation: 'rise',
      highlight: `+${pct}%`,
    };
  },

  // ---- VISSTE DU (tier 3) ----
  ({ visits }) => {
    const signed = visits.filter(v => v.result === 'signerat' && Number(v.order_value) > 0);
    if (signed.length < 4) return null;
    const avg = signed.reduce((s, v) => s + Number(v.order_value), 0) / signed.length;
    return {
      id: 'fact_avg_deal',
      tier: 3, category: 'fun',
      score: 35,
      emoji: '💡',
      title: `Din snittaffär är ${fmtKr(avg)}`,
      animation: 'none',
    };
  },

  ({ visits }) => {
    const signed = visits.filter(v => v.result === 'signerat');
    if (signed.length < 6) return null;
    const cities = new Set(signed.map(v => extractCity(v.address)).filter(Boolean));
    if (cities.size < 3) return null;
    return {
      id: 'fact_cities_count',
      tier: 3, category: 'fun',
      score: 30,
      emoji: '🗺️',
      title: `Du har sålt i ${cities.size} olika orter`,
      animation: 'none',
    };
  },

  ({ visits }) => {
    const signed = visits.filter(v => v.result === 'signerat');
    if (signed.length < 6) return null;
    const dc = new Array(7).fill(0);
    signed.forEach(v => dc[new Date(v.date).getDay()]++);
    const idx = dc.indexOf(Math.max(...dc));
    if (dc[idx] / signed.length < 0.25) return null;
    return {
      id: 'fact_best_weekday',
      tier: 3, category: 'fun',
      score: 32,
      emoji: '📅',
      title: `Du signerar oftast på ${WEEKDAYS[idx]}ar`,
      animation: 'none',
    };
  },

  // ---- MÅNAD / TIDSBASERAT (tier 2-3) ----
  ({ visits }) => {
    // Denna månad: X signeringar / Y kr + jmf mot förra månaden
    const now = new Date();
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const signed = visits.filter(v => v.result === 'signerat');
    const thisM = signed.filter(v => new Date(v.date) >= mStart);
    const prevM = signed.filter(v => {
      const d = new Date(v.date); return d >= prevStart && d < mStart;
    });
    if (thisM.length < 1) return null;
    const sumThis = thisM.reduce((s, v) => s + (Number(v.order_value) || 0), 0);
    const sumPrev = prevM.reduce((s, v) => s + (Number(v.order_value) || 0), 0);
    const cmp = sumPrev > 0
      ? ` (förra månaden: ${fmtKr(sumPrev)})`
      : '';
    return {
      id: 'month_summary',
      tier: 3, category: 'month',
      score: 45,
      emoji: '🗓️',
      title: `${thisM.length} signeringar / ${fmtKr(sumThis)} denna månad`,
      subtitle: cmp || undefined,
      animation: 'none',
    };
  },

  ({ visits }) => {
    // År till dato: X kr sålt
    const year = new Date().getFullYear();
    const ytd = visits
      .filter(v => v.result === 'signerat' && new Date(v.date).getFullYear() === year)
      .reduce((s, v) => s + (Number(v.order_value) || 0), 0);
    if (ytd <= 0) return null;
    return {
      id: `month_ytd_${year}`,
      tier: 3, category: 'fact',
      score: 38,
      emoji: '📊',
      title: `${fmtKr(ytd)} sålt år till dato`,
      animation: 'none',
    };
  },

  ({ visits }) => {
    // Dagar sedan senaste signering — peppning om det var ett tag sen
    const signed = visits.filter(v => v.result === 'signerat');
    if (signed.length < 3) return null;
    const latest = signed.reduce((m, v) => Math.max(m, new Date(v.date).getTime()), 0);
    if (!latest) return null;
    const days = Math.floor((Date.now() - latest) / DAY);
    if (days < 7) return null;
    return {
      id: 'pep_days_since_signed',
      tier: 4, category: 'pep',
      score: 25 + Math.min(15, days - 7),
      emoji: '🎯',
      title: `${days} dagar sedan din senaste signering`,
      subtitle: 'Nästa kan vara idag — kör hårt!',
      animation: 'none',
    };
  },

  ({ visits }) => {
    // Din bästa månad hittills
    const signed = visits.filter(v => v.result === 'signerat' && Number(v.order_value) > 0);
    if (signed.length < 6) return null;
    const byMonth = new Map<string, number>();
    signed.forEach(v => {
      const d = new Date(v.date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(k, (byMonth.get(k) || 0) + (Number(v.order_value) || 0));
    });
    if (byMonth.size < 3) return null;
    const best = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0];
    const [y, m] = best[0].split('-').map(Number);
    const monthName = new Date(y, m - 1, 1).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
    return {
      id: `fact_best_month_${best[0]}`,
      tier: 3, category: 'fact',
      score: 36,
      emoji: '🏅',
      title: `Din bästa månad hittills: ${monthName}`,
      subtitle: fmtKr(best[1]),
      animation: 'none',
    };
  },

  ({ visits }) => {
    // Flest besök på en dag
    if (visits.length < 10) return null;
    const byDay = new Map<string, number>();
    visits.forEach(v => {
      const k = isoDate(v.date);
      byDay.set(k, (byDay.get(k) || 0) + 1);
    });
    const best = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!best || best[1] < 3) return null;
    return {
      id: `fact_max_visits_day_${best[0]}`,
      tier: 3, category: 'fact',
      score: 34,
      emoji: '⚡',
      title: `Flest besök på en dag: ${best[1]} (${best[0]})`,
      animation: 'none',
    };
  },

  // ---- PEPP (tier 4) ----
  ({ visits }) => {

    const followUps = visits.filter(v =>
      v.result === 'aterkoppla' && v.follow_up_date &&
      isoDate(v.follow_up_date) <= isoDate(new Date()) && !v.lost
    ).length;
    if (!followUps) return null;
    return {
      id: 'pep_followups',
      tier: 4, category: 'nudge',
      score: 20 + followUps,
      emoji: '📞',
      title: `${followUps} återkopplingar att följa upp`,
      animation: 'none',
    };
  },

  ({ visits }) => {
    const today = isoDate(new Date());
    if (visits.some(v => isoDate(v.date) === today)) return null;
    const dow = new Date().getDay();
    if (dow === 0 || dow === 6) return null;
    return {
      id: 'pep_register_today',
      tier: 4, category: 'nudge',
      score: 15,
      emoji: '✏️',
      title: 'Glöm inte registrera dagens besök',
      animation: 'none',
    };
  },

  () => ({
    id: 'pep_default',
    tier: 4, category: 'nudge',
    score: 5,
    emoji: '💪',
    title: 'En ny chans varje dag — kör hårt!',
    animation: 'none',
  }),
];

// ============ MONTOR GENERATORS ============

const MONTOR_GENERATORS: MontorGenerator[] = [
  // KVALITET — N jobb i rad utan reklamation
  ({ cases, deviations, name }) => {
    const mine = cases
      .filter(c => c.team === name && ['montage_klart', 'fakturerad'].includes(c.status))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    if (mine.length < 3) return null;
    const devIds = new Set(deviations.map(d => d.case_id));
    let streak = 0;
    for (const c of mine) {
      if (devIds.has(c.id)) break;
      streak++;
    }
    if (streak < 3) return null;
    const isBig = streak >= 10;
    return {
      id: 'mq_clean_streak',
      tier: isBig ? 1 : 2, category: 'quality',
      score: 60 + Math.min(35, streak * 2),
      emoji: isBig ? '🔥' : '✨',
      title: `${streak} jobb i rad utan reklamation`,
      subtitle: 'Toppkvalitet — fortsätt så!',
      animation: isBig ? 'fire' : 'shimmer',
      highlight: String(streak),
    };
  },

  // VOLYM — flest montage per vecka
  ({ cases, name }) => {
    const mine = cases.filter(c => c.team === name && c.status !== 'ny');
    if (mine.length < 8) return null;
    const byWeek = new Map<string, number>();
    mine.forEach(c => {
      if (!c.montage_date) return;
      const k = isoWeekKey(c.montage_date);
      byWeek.set(k, (byWeek.get(k) || 0) + 1);
    });
    if (byWeek.size < 3) return null;
    const thisKey = isoWeekKey(new Date());
    const thisCount = byWeek.get(thisKey) || 0;
    const others = [...byWeek.entries()].filter(([k]) => k !== thisKey).map(([, n]) => n);
    const maxOther = others.length ? Math.max(...others) : 0;
    if (thisCount <= maxOther || thisCount < 2) return null;
    return {
      id: 'mv_record_week_montage',
      tier: 1, category: 'volume',
      score: 88,
      emoji: '🏆',
      title: `${thisCount} montage denna vecka — nytt rekord!`,
      subtitle: `Tidigare bästa: ${maxOther}`,
      animation: 'laser',
      highlight: String(thisCount),
    };
  },

  // Milstolpe 100 i år
  ({ cases, name }) => {
    const year = new Date().getFullYear();
    const mine = cases.filter(c =>
      c.team === name && ['montage_klart', 'fakturerad'].includes(c.status) &&
      new Date(c.updated_at).getFullYear() === year
    );
    const tiers = [25, 50, 100, 200];
    const next = tiers.find(t => mine.length < t && t - mine.length <= 5);
    if (!next) return null;
    return {
      id: `mv_milestone_year_${next}`,
      tier: 2, category: 'milestone',
      score: 55 + (6 - (next - mine.length)) * 3,
      emoji: '🎯',
      title: `${next - mine.length} kvar till ${next} montage i år`,
      subtitle: `Du är på ${mine.length}`,
      animation: 'none',
    };
  },

  // 0 avvikelser denna månad
  ({ cases, deviations, name }) => {
    const mStart = new Date(); mStart.setDate(1); mStart.setHours(0, 0, 0, 0);
    const mine = cases.filter(c => c.team === name && new Date(c.updated_at) >= mStart && ['montage_klart', 'fakturerad'].includes(c.status));
    if (mine.length < 3) return null;
    const ids = new Set(mine.map(c => c.id));
    const hasDev = deviations.some(d => ids.has(d.case_id));
    if (hasDev) return null;
    return {
      id: 'mq_zero_devs_month',
      tier: 2, category: 'quality',
      score: 65,
      emoji: '✅',
      title: '0 avvikelser denna månad',
      subtitle: `${mine.length} jobb levererade rent`,
      animation: 'shimmer',
      highlight: '0',
    };
  },

  // Klara denna vecka peppkort
  ({ cases, name }) => {
    const wkStart = startOfWeek(new Date());
    const klara = cases.filter(c =>
      c.team === name && c.status === 'montage_klart' && new Date(c.updated_at) >= wkStart
    ).length;
    if (!klara) return null;
    return {
      id: 'mv_klara_this_week',
      tier: 3, category: 'volume',
      score: 30 + klara * 2,
      emoji: '💪',
      title: `${klara} montage klara denna vecka`,
      animation: klara >= 3 ? 'rise' : 'none',
    };
  },

  // Pep default
  () => ({
    id: 'mq_pep_default',
    tier: 4, category: 'nudge',
    score: 5,
    emoji: '🛠️',
    title: 'Ett jobb i taget — kör på!',
    animation: 'none',
  }),
];

// ============ SELECTION + ROTATION ============

const SESSION_REFRESH_HOURS = 3;

// Cooldown per kategori (dagar)
const COOLDOWN_BY_CATEGORY: Record<string, number> = {
  record: 3,
  streak: 3,
  trend: 3,
  hitrate: 14,
  milestone: 14,
  geo: 30,
  fun: 30,
  fact: 30,
  month: 14,
  pep: 7,
  nudge: 1,
  quality: 7,
  volume: 7,
};
function cooldownDaysFor(category: string): number {
  return COOLDOWN_BY_CATEGORY[category] ?? 7;
}

// Dynamiska kategorier får full vikt, stabila viktas ned något
const DYNAMIC_CATEGORIES = new Set(['record', 'streak', 'trend', 'milestone', 'quality', 'volume']);
const STABLE_CATEGORIES = new Set(['geo', 'fun', 'fact', 'month']);
function categoryWeight(category: string): number {
  if (STABLE_CATEGORIES.has(category)) return 0.85;
  if (DYNAMIC_CATEGORIES.has(category)) return 1.0;
  return 0.95;
}

export interface HistoryEntry {
  insight_id: string;
  shown_at: number; // ms epoch
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export interface SelectionResult {
  insights: InsightCandidate[];
  /** true om nytt urval gjordes (ska loggas server-sidigt). false vid samma-session-återanvändning. */
  isNewSelection: boolean;
}

export function getInsightsForSeller(name: string, data: SellerData, history: HistoryEntry[] = []): InsightCandidate[] {
  return selectFromSellerData(name, data, history).insights;
}
export function selectFromSellerData(name: string, data: SellerData, history: HistoryEntry[]): SelectionResult {
  const all = SELLER_GENERATORS.map(g => {
    try { return g(data); } catch { return null; }
  }).filter((x): x is InsightCandidate => !!x);
  return selectWithMeta(name, all, history);
}

export function getInsightsForMontor(name: string, data: MontorData, history: HistoryEntry[] = []): InsightCandidate[] {
  return selectFromMontorData(name, data, history).insights;
}
export function selectFromMontorData(name: string, data: MontorData, history: HistoryEntry[]): SelectionResult {
  const all = MONTOR_GENERATORS.map(g => {
    try { return g(data); } catch { return null; }
  }).filter((x): x is InsightCandidate => !!x);
  return selectWithMeta(name, all, history);
}

export function selectWithMeta(name: string, candidates: InsightCandidate[], history: HistoryEntry[]): SelectionResult {
  const lastKey = `sk_last_login_${name}`;
  const sessionKey = `sk_insights_session_${name}`;
  const now = Date.now();
  const lastLogin: number = loadJSON(lastKey, 0);
  const sessionAge = now - lastLogin;
  const isSameSession = sessionAge >= 0 && sessionAge < SESSION_REFRESH_HOURS * 3600_000;

  if (isSameSession) {
    const stored: string[] = loadJSON(sessionKey, []);
    if (stored.length) {
      const map = new Map(candidates.map(c => [c.id, c]));
      const resolved = stored.map(id => map.get(id)).filter((x): x is InsightCandidate => !!x);
      if (resolved.length) return { insights: resolved, isNewSelection: false };
    }
  }

  // Bygg map: id -> senaste shown_at
  const recentlyShown = new Map<string, number>();
  history.forEach(h => {
    const prev = recentlyShown.get(h.insight_id) || 0;
    if (h.shown_at > prev) recentlyShown.set(h.insight_id, h.shown_at);
  });

  // Hitta "senaste sessionens" ids (allt visat inom 1h från senaste raden)
  const lastShownAt = history.reduce((m, h) => Math.max(m, h.shown_at), 0);
  const lastSessionIds = new Set(
    lastShownAt
      ? history.filter(h => (lastShownAt - h.shown_at) < 60 * 60_000).map(h => h.insight_id)
      : []
  );

  // Cooldown-filter per kategori (rekord-tier1 får alltid komma in)
  const eligibleAll = candidates.filter(c => {
    const seen = recentlyShown.get(c.id);
    if (!seen) return true;
    if (c.tier === 1 && c.category === 'record') return true;
    const cdMs = cooldownDaysFor(c.category) * DAY;
    return (now - seen) > cdMs;
  });

  // Hård spärr: uteslut det som visades senast — om det finns annat kvar
  const withoutLast = eligibleAll.filter(c => !lastSessionIds.has(c.id));
  const eligible = withoutLast.length > 0 ? withoutLast : eligibleAll;

  // Poäng: penalty som dör ut när cooldown gått ut + kategorivikt
  const scored = eligible.map(c => {
    const seen = recentlyShown.get(c.id);
    const cdDays = cooldownDaysFor(c.category);
    const daysSince = seen ? (now - seen) / DAY : Infinity;
    const penalty = seen ? Math.max(0, 30 * (1 - daysSince / cdDays)) : 0;
    return { ...c, score: (c.score - penalty) * categoryWeight(c.category) };
  }).sort((a, b) => b.score - a.score);

  const picked: InsightCandidate[] = [];
  const usedCategories = new Set<string>();

  // Hero från tier 1
  const tier1 = scored.filter(c => c.tier === 1);
  if (tier1.length) {
    picked.push(tier1[0]);
    usedCategories.add(tier1[0].category);
  }

  // Fyll med tier 2 sen 3 med kategori-variation
  for (const tier of [2, 3] as Tier[]) {
    if (picked.length >= 3) break;
    const pool = scored.filter(c => c.tier === tier && !picked.includes(c));
    for (const c of pool) {
      if (picked.length >= 3) break;
      if (usedCategories.has(c.category)) continue;
      picked.push(c);
      usedCategories.add(c.category);
    }
  }

  // Daglig rotation: garantera ett tier 3–4 kort som roterar via dagsnummer
  const lowTierPool = scored.filter(c =>
    (c.tier === 3 || c.tier === 4) && !picked.includes(c) && !usedCategories.has(c.category)
  );
  if (lowTierPool.length && picked.length < 3) {
    const dayN = Math.floor(now / DAY);
    const rotated = lowTierPool[dayN % lowTierPool.length];
    picked.push(rotated);
    usedCategories.add(rotated.category);
  }

  // Tier 4 fallback om vi har 0
  if (picked.length === 0) {
    const t4 = scored.filter(c => c.tier === 4)[0];
    if (t4) picked.push(t4);
  }

  // Spara sessionsmetadata (lokal 3h-återanvändning). Historik sparas server-sidigt av anroparen.
  saveJSON(lastKey, now);
  saveJSON(sessionKey, picked.map(p => p.id));

  return { insights: picked, isNewSelection: true };
}

