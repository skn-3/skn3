import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// AGENTS.md: en service worker är tillåten enbart för push. Den får aldrig ha en fetch-lyssnare, aldrig cacha
// och aldrig precacha app-skalet, så att appen alltid laddar färskt.
const source = fs.readFileSync(path.resolve(__dirname, '../../../../public/sw.js'), 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('public/sw.js (enbart push)', () => {
  it('har ingen fetch-lyssnare', () => {
    expect(code).not.toMatch(/addEventListener\(\s*['"`]fetch['"`]/);
    expect(code).not.toMatch(/\bonfetch\b/);
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/respondWith/);
  });
  it('använder aldrig caches och precachar inget', () => {
    expect(code).not.toMatch(/\bcaches\b/);
    expect(code).not.toMatch(/precache|workbox|importScripts|__WB_MANIFEST/i);
  });
  it('lyssnar bara på install, activate, push, notificationclick och pushsubscriptionchange', () => {
    const events = [...code.matchAll(/addEventListener\(\s*['"`]([a-z]+)['"`]/g)].map((m) => m[1]);
    expect(events.sort()).toEqual(['activate', 'install', 'notificationclick', 'push', 'pushsubscriptionchange']);
    expect(code).not.toMatch(/\bon(install|activate|push|message|sync|periodicsync)\s*=/);
  });
  it('visar alltid en notis vid push', () => {
    expect(code).toMatch(/showNotification\(/);
  });
});

describe('inget app-skal-cache i bygget', () => {
  it('vite-plugin-pwa och workbox finns inte bland beroendena', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => /vite-plugin-pwa|workbox/.test(d))).toEqual([]);
  });
});
