// Push-notiser i webbläsaren: service worker (enbart push), prenumeration och status. Delat tillstånd för alla
// konsumenter (guiden, chattlistan, menyn) via en liten modulbutik. All beslutslogik ligger i src/lib/push.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useMessagingUser } from '@/hooks/useMessagingUser';
import { base64UrlToBytes, detectPushPlatform, deviceLabel, pushStatus, type PushEnvironment, type PushPlatform, type PushStatus } from '@/lib/push/platform';

/** Fel med svensk text som kan visas för användaren; webbläsarens egna fel (engelska) visas aldrig. */
class PushError extends Error {}

interface Store { platform: PushPlatform; permission: 'default' | 'granted' | 'denied' | null; subscribed: boolean; busy: boolean; checked: boolean }

function readEnvironment(): PushEnvironment {
  if (typeof window === 'undefined') return { userAgent: '', maxTouchPoints: 0, standalone: false, hasServiceWorker: false, hasPushManager: false, hasNotification: false, inIframe: false };
  let inIframe = false;
  try { inIframe = window.self !== window.top; } catch { inIframe = true; }
  const nav = navigator as Navigator & { standalone?: boolean };
  let standalone = nav.standalone === true;
  try { standalone = standalone || window.matchMedia('(display-mode: standalone)').matches; } catch { /* äldre webbläsare */ }
  return {
    userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints || 0, standalone,
    hasServiceWorker: 'serviceWorker' in navigator, hasPushManager: 'PushManager' in window, hasNotification: 'Notification' in window, inIframe,
  };
}
const currentPermission = (): Store['permission'] => (typeof Notification !== 'undefined' ? Notification.permission : null);

let store: Store = { platform: detectPushPlatform(readEnvironment()), permission: currentPermission(), subscribed: false, busy: false, checked: false };
const listeners = new Set<() => void>();
function setStore(patch: Partial<Store>) { store = { ...store, ...patch }; listeners.forEach(l => l()); }
const canUseWorker = () => store.platform !== 'unsupported' && store.platform !== 'ios-needs-home-screen';

let keyCache: { userId: string; promise: Promise<string> } | null = null;
/** VAPID public key från chat-push (skapas på servern första gången). Hämtas i förväg så att prenumerationen går fort efter trycket. */
function publicKey(userId: string): Promise<string> {
  if (keyCache?.userId === userId) return keyCache.promise;
  const promise = supabase.functions.invoke('chat-push', { body: { action: 'config' } }).then(({ data, error }) => {
    if (error || typeof data?.publicKey !== 'string') throw new PushError('Notiserna kunde inte förberedas. Försök igen.');
    return data.publicKey as string;
  });
  promise.catch(() => { if (keyCache?.promise === promise) keyCache = null; });
  keyCache = { userId, promise };
  return promise;
}

/** Registrerar /sw.js (enbart push). Bara i toppfönster med stöd; ett fel kraschar aldrig appen. */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!canUseWorker()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing?.active?.scriptURL.endsWith('/sw.js')) return existing;
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

function sameKey(sub: PushSubscription, key: Uint8Array<ArrayBuffer>): boolean {
  const current = sub.options?.applicationServerKey;
  if (!current) return true;
  const a = new Uint8Array(current);
  return a.length === key.length && a.every((b, i) => b === key[i]);
}

async function register(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await supabase.rpc('push_subscribe', {
    p_endpoint: sub.endpoint, p_p256dh: json.keys?.p256dh ?? '', p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent.slice(0, 512), p_device_label: deviceLabel(navigator.userAgent, navigator.maxTouchPoints || 0),
  });
  if (error) throw new PushError('Enheten kunde inte registreras. Försök igen.');
}

async function subscribeWith(reg: ServiceWorkerRegistration, key: Uint8Array<ArrayBuffer>): Promise<PushSubscription> {
  const existing = await reg.pushManager.getSubscription();
  if (existing && sameKey(existing, key)) return existing;
  if (existing) await existing.unsubscribe().catch(() => false);
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

let syncedFor: string | null = null;
/** Vid appstart med tillståndet granted: prenumerationen finns kvar och är registrerad på den inloggade. */
async function syncOnStart(userId: string) {
  setStore({ permission: currentPermission(), platform: detectPushPlatform(readEnvironment()) });
  if (!canUseWorker()) { setStore({ checked: true, subscribed: false }); return; }
  const reg = await registration();
  if (!reg || currentPermission() !== 'granted') { setStore({ checked: true, subscribed: false }); return; }
  try {
    const key = base64UrlToBytes(await publicKey(userId));
    const sub = await subscribeWith(reg, key);
    await register(sub);
    syncedFor = userId;
    setStore({ checked: true, subscribed: true });
  } catch {
    setStore({ checked: true, subscribed: false });
  }
}

/** Måste anropas direkt i ett tryck: tillstånd först, sedan prenumeration med nyckeln från config, sedan push_subscribe. */
function enable(userId: string | null): Promise<{ ok: boolean; message?: string }> {
  if (!userId || !canUseWorker() || typeof Notification === 'undefined') return Promise.resolve({ ok: false, message: 'Notiser stöds inte här.' });
  const permission = Notification.requestPermission();
  setStore({ busy: true });
  return (async () => {
    try {
      const result = await permission;
      setStore({ permission: result });
      if (result !== 'granted') return { ok: false, message: result === 'denied' ? 'Notiser är blockerade för appen.' : 'Notiser slogs inte på.' };
      const [reg, key] = await Promise.all([registration(), publicKey(userId)]);
      if (!reg) return { ok: false, message: 'Notiserna kunde inte förberedas. Försök igen.' };
      const sub = await subscribeWith(reg, base64UrlToBytes(key));
      await register(sub);
      syncedFor = userId;
      setStore({ subscribed: true, checked: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof PushError ? e.message : 'Webbläsaren kunde inte slå på notiser. Försök igen, eller öppna appen i Chrome, Edge, Firefox eller Safari.' };
    } finally {
      setStore({ busy: false });
    }
  })();
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!canUseWorker()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

async function disable(): Promise<void> {
  setStore({ busy: true });
  try {
    const sub = await currentSubscription();
    if (sub) {
      await supabase.rpc('push_unsubscribe', { p_endpoint: sub.endpoint });
      await sub.unsubscribe().catch(() => false);
    }
    syncedFor = null;
    setStore({ subscribed: false });
  } finally {
    setStore({ busy: false });
  }
}

async function sendTest(): Promise<{ sent: number; devices: number }> {
  const { data, error } = await supabase.functions.invoke('chat-push', { body: { action: 'test' } });
  if (error) throw new PushError('Testnotisen kunde inte skickas.');
  return { sent: Number(data?.sent) || 0, devices: Number(data?.devices) || 0 };
}

/**
 * Vid utloggning: ta bort enhetens prenumeration från den som loggar ut, så att nästa person på samma enhet inte får
 * den förras notiser. Väntar högst tre sekunder och kastar aldrig.
 */
export async function pushUnsubscribeOnLogout(): Promise<void> {
  try {
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    nav.clearAppBadge?.().catch(() => {});
    const work = (async () => {
      const sub = await currentSubscription();
      if (sub) await supabase.rpc('push_unsubscribe', { p_endpoint: sub.endpoint });
    })();
    await Promise.race([work, new Promise(r => setTimeout(r, 3000))]);
  } catch { /* utloggningen fortsätter alltid */ }
  syncedFor = null;
  keyCache = null;
  setStore({ subscribed: false, checked: false });
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
const snapshot = () => store;

/** Status och åtgärder för notiser på den här enheten. */
export function usePush() {
  const userId = useMessagingUser();
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  const status: PushStatus = pushStatus({ platform: s.platform, permission: s.permission, subscribed: s.subscribed && syncedFor === userId });
  return {
    status, platform: s.platform, busy: s.busy, checked: s.checked, userId,
    enable: useCallback(() => enable(userId), [userId]),
    disable: useCallback(() => disable(), []),
    sendTest: useCallback(() => sendTest(), []),
    prefetch: useCallback(() => { if (userId && canUseWorker()) publicKey(userId).catch(() => {}); }, [userId]),
  };
}

/** Monteras en gång i det inloggade skalet: synkar prenumerationen vid start och när service workern ber om det. */
export function usePushSync() {
  const userId = useMessagingUser();
  useEffect(() => {
    if (!userId) return;
    void syncOnStart(userId);
    const onVisible = () => { if (document.visibilityState === 'visible') setStore({ permission: currentPermission() }); };
    const onMessage = (event: MessageEvent) => { if (event.data?.type === 'smartklimat:push-resync') void syncOnStart(userId); };
    document.addEventListener('visibilitychange', onVisible);
    if (canUseWorker()) navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (canUseWorker()) navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [userId]);
}
