import { describe, it, expect } from 'vitest';
import { isLocalBackendUrl } from '../../../supabase/functions/_shared/localBackend';

describe('isLocalBackendUrl – spärr mot riktiga utskick från utkast', () => {
  it('utkastets backend (http://127.0.0.1:8001) är lokal', () => {
    expect(isLocalBackendUrl('http://127.0.0.1:8001')).toBe(true);
  });
  it.each(['http://localhost:54321', 'http://kong:8000', 'http://host.docker.internal:54321', 'http://10.0.0.5:8000', 'http://172.17.0.1:8000', 'http://192.168.1.20', 'http://[::1]:8000'])('%s är lokal', (u) => {
    expect(isLocalBackendUrl(u)).toBe(true);
  });
  it('produktionens adress träffas aldrig av spärren', () => {
    expect(isLocalBackendUrl('https://gzeovhwoouoxfenaxsss.supabase.co')).toBe(false);
    expect(isLocalBackendUrl('https://abcdefghijklmnop.supabase.co/')).toBe(false);
  });
  it('standard är att skicka: saknad, ogiltig eller okänd adress är inte lokal', () => {
    expect(isLocalBackendUrl(undefined)).toBe(false);
    expect(isLocalBackendUrl('')).toBe(false);
    expect(isLocalBackendUrl('inte en url')).toBe(false);
    expect(isLocalBackendUrl('https://api.example.com')).toBe(false);
    expect(isLocalBackendUrl('http://172.32.0.1')).toBe(false);
    expect(isLocalBackendUrl('http://8.8.8.8')).toBe(false);
  });
});
