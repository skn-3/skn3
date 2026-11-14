// Vilket läge guiden startar i. iPhone, iPad och Mac ger Apple, Android ger Google, övriga datorer datorläget.
export type GuidePlatform = 'apple' | 'google' | 'desktop';

export function detectPlatform(userAgent: string | null | undefined): GuidePlatform {
  const ua = userAgent ?? '';
  if (/iPhone|iPad|iPod/i.test(ua) || /Macintosh|Mac OS X/i.test(ua)) return 'apple';
  if (/Android/i.test(ua)) return 'google';
  return 'desktop';
}
