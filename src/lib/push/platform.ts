// Plattformsläge, status och enhetsetikett för push-notiser. Ren logik.

export type PushPlatform = 'ios-needs-home-screen' | 'installed' | 'android' | 'desktop' | 'unsupported';
export type PushStatus = 'unsupported' | 'needs-home-screen' | 'off' | 'on' | 'blocked';

export interface PushEnvironment {
  userAgent: string;
  /** navigator.maxTouchPoints: iPad i Safari utger sig för att vara en Mac. */
  maxTouchPoints: number;
  /** Öppnad från hemskärmen (display-mode: standalone eller navigator.standalone). */
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  /** Appen visas i en iframe (till exempel förhandsvisningen). */
  inIframe: boolean;
}

export function isIOSDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/**
 * iPhone och iPad: push finns bara i appen som lagts till på hemskärmen. Installerad app med stöd: installed.
 * Annars Android eller dator, eller inget stöd när webbläsaren saknar service worker, PushManager eller Notification.
 */
export function detectPushPlatform(env: PushEnvironment): PushPlatform {
  const ios = isIOSDevice(env.userAgent, env.maxTouchPoints);
  if (env.inIframe) return 'unsupported';
  if (ios && !env.standalone) return 'ios-needs-home-screen';
  const supported = env.hasServiceWorker && env.hasPushManager && env.hasNotification;
  if (!supported) return 'unsupported';
  if (env.standalone) return 'installed';
  if (/Android/i.test(env.userAgent)) return 'android';
  return 'desktop';
}

export interface PushStatusInput {
  platform: PushPlatform;
  /** Notification.permission. */
  permission: 'default' | 'granted' | 'denied' | null;
  /** Webbläsaren har en prenumeration som är registrerad på den inloggade. */
  subscribed: boolean;
}

export function pushStatus({ platform, permission, subscribed }: PushStatusInput): PushStatus {
  if (platform === 'unsupported') return 'unsupported';
  if (platform === 'ios-needs-home-screen') return 'needs-home-screen';
  if (permission === 'denied') return 'blocked';
  if (permission === 'granted' && subscribed) return 'on';
  return 'off';
}

/** Notiser kan slås på eller är på väg att slås på; används för raden i chattlistan. */
export function pushNeedsAttention(status: PushStatus): boolean {
  return status === 'off' || status === 'needs-home-screen' || status === 'blocked';
}

function browserName(ua: string): string | null {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
  if (/Chrome\/|CriOS\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return null;
}

/** Enhetsetikett, till exempel "iPhone", "iPad", "Android · Chrome" eller "Mac · Safari". */
export function deviceLabel(userAgent: string, maxTouchPoints = 0): string {
  const ua = userAgent || '';
  if (/iPhone|iPod/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) return 'iPad';
  const browser = browserName(ua);
  const os = /Android/i.test(ua) ? 'Android' : /Macintosh|Mac OS X/i.test(ua) ? 'Mac' : /Windows/i.test(ua) ? 'Windows' : /CrOS/i.test(ua) ? 'Chromebook' : /Linux/i.test(ua) ? 'Linux' : 'Enhet';
  return browser ? `${os} · ${browser}` : os;
}

/** Appikonens bricka: antal att visa, eller null för att rensa. */
export function appBadgeCount(unread: number): number | null {
  const n = Math.floor(Number(unread) || 0);
  return n > 0 ? n : null;
}

/** Konversationen i en adress från notisen (/?chat=<id>), annars null. */
export function chatIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, 'https://app.invalid');
    const id = parsed.searchParams.get('chat');
    return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** base64url till bytes (applicationServerKey till pushManager.subscribe). */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
