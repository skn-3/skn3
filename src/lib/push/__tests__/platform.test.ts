import { describe, it, expect } from 'vitest';
import { appBadgeCount, base64UrlToBytes, chatIdFromUrl, detectPushPlatform, deviceLabel, pushNeedsAttention, pushStatus, type PushEnvironment } from '../platform';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const WIN_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
const full = (over: Partial<PushEnvironment>): PushEnvironment => ({ userAgent: MAC_CHROME, maxTouchPoints: 0, standalone: false, hasServiceWorker: true, hasPushManager: true, hasNotification: true, inIframe: false, ...over });

describe('detectPushPlatform', () => {
  it('iPhone i Safari utan hemskärm kräver hemskärmen, även utan PushManager', () => {
    expect(detectPushPlatform(full({ userAgent: IPHONE, hasPushManager: false, hasNotification: false }))).toBe('ios-needs-home-screen');
  });
  it('iPad som utger sig för att vara Mac (pekskärm) kräver hemskärmen', () => {
    expect(detectPushPlatform(full({ userAgent: IPAD, maxTouchPoints: 5, hasPushManager: false }))).toBe('ios-needs-home-screen');
  });
  it('Mac med Safari utan pekskärm är dator', () => {
    expect(detectPushPlatform(full({ userAgent: IPAD, maxTouchPoints: 0 }))).toBe('desktop');
  });
  it('iPhone från hemskärmen med stöd är installerad app', () => {
    expect(detectPushPlatform(full({ userAgent: IPHONE, standalone: true }))).toBe('installed');
  });
  it('iPhone från hemskärmen utan stöd (för gammal iOS) saknar stöd', () => {
    expect(detectPushPlatform(full({ userAgent: IPHONE, standalone: true, hasPushManager: false }))).toBe('unsupported');
  });
  it('Android och dator', () => {
    expect(detectPushPlatform(full({ userAgent: ANDROID }))).toBe('android');
    expect(detectPushPlatform(full({ userAgent: WIN_EDGE }))).toBe('desktop');
  });
  it('iframe och saknade gränssnitt saknar stöd', () => {
    expect(detectPushPlatform(full({ inIframe: true }))).toBe('unsupported');
    expect(detectPushPlatform(full({ hasServiceWorker: false }))).toBe('unsupported');
    expect(detectPushPlatform(full({ hasNotification: false }))).toBe('unsupported');
  });
});

describe('pushStatus', () => {
  it('stöds inte och kräver hemskärm går före tillståndet', () => {
    expect(pushStatus({ platform: 'unsupported', permission: 'granted', subscribed: true })).toBe('unsupported');
    expect(pushStatus({ platform: 'ios-needs-home-screen', permission: null, subscribed: false })).toBe('needs-home-screen');
  });
  it('blockerat, påslaget och inte påslaget', () => {
    expect(pushStatus({ platform: 'desktop', permission: 'denied', subscribed: false })).toBe('blocked');
    expect(pushStatus({ platform: 'android', permission: 'granted', subscribed: true })).toBe('on');
    expect(pushStatus({ platform: 'android', permission: 'granted', subscribed: false })).toBe('off');
    expect(pushStatus({ platform: 'installed', permission: 'default', subscribed: false })).toBe('off');
  });
  it('raden i chattlistan visas för inte påslaget, kräver hemskärm och blockerat', () => {
    expect(pushNeedsAttention('off')).toBe(true);
    expect(pushNeedsAttention('needs-home-screen')).toBe(true);
    expect(pushNeedsAttention('blocked')).toBe(true);
    expect(pushNeedsAttention('on')).toBe(false);
    expect(pushNeedsAttention('unsupported')).toBe(false);
  });
});

describe('deviceLabel', () => {
  it('ger korta enhetsnamn', () => {
    expect(deviceLabel(IPHONE)).toBe('iPhone');
    expect(deviceLabel(IPAD, 5)).toBe('iPad');
    expect(deviceLabel(IPAD, 0)).toBe('Mac · Safari');
    expect(deviceLabel(MAC_CHROME)).toBe('Mac · Chrome');
    expect(deviceLabel(ANDROID)).toBe('Android · Chrome');
    expect(deviceLabel(WIN_EDGE)).toBe('Windows · Edge');
    expect(deviceLabel('')).toBe('Enhet');
  });
});

describe('appikonens bricka och notisens adress', () => {
  it('visar antal olästa och rensar vid noll', () => {
    expect(appBadgeCount(4)).toBe(4);
    expect(appBadgeCount(0)).toBeNull();
    expect(appBadgeCount(-2)).toBeNull();
    expect(appBadgeCount(Number.NaN)).toBeNull();
  });
  it('läser konversationen ur /?chat=<id>', () => {
    const id = '919ee20a-f902-4656-aa04-6f0914c47c3a';
    expect(chatIdFromUrl(`/?chat=${id}`)).toBe(id);
    expect(chatIdFromUrl(`https://smartklimatentreprenad.com/?chat=${id}&x=1`)).toBe(id);
    expect(chatIdFromUrl('/?chat=inte-ett-id')).toBeNull();
    expect(chatIdFromUrl('/')).toBeNull();
    expect(chatIdFromUrl(null)).toBeNull();
  });
  it('avkodar applicationServerKey från base64url', () => {
    expect([...base64UrlToBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });
});
