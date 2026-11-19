import { describe, it, expect } from 'vitest';
import { EMPTY_PUSH_STATE, PUSH_AUTO_SHOW_LIMIT, markPushShown, parsePushState, pushStorageKey, reconcilePushState, shouldAutoShowPushGuide, snoozePushUntilTomorrow } from '../guide';

const today = '2026-11-19';
const base = { status: 'off' as const, state: EMPTY_PUSH_STATE, today, calendarGuideThisSession: false };

describe('shouldAutoShowPushGuide', () => {
  it('visas tills enheten är klar, högst tre gånger', () => {
    expect(PUSH_AUTO_SHOW_LIMIT).toBe(3);
    let state = EMPTY_PUSH_STATE;
    for (let i = 0; i < 3; i++) { expect(shouldAutoShowPushGuide({ ...base, state })).toBe(true); state = markPushShown(state); }
    expect(shouldAutoShowPushGuide({ ...base, state })).toBe(false);
  });
  it('visas för kräver hemskärm och blockerat, inte för påslaget eller inget stöd', () => {
    expect(shouldAutoShowPushGuide({ ...base, status: 'needs-home-screen' })).toBe(true);
    expect(shouldAutoShowPushGuide({ ...base, status: 'blocked' })).toBe(true);
    expect(shouldAutoShowPushGuide({ ...base, status: 'on' })).toBe(false);
    expect(shouldAutoShowPushGuide({ ...base, status: 'unsupported' })).toBe(false);
  });
  it('Påminn mig i morgon skjuter upp till nästa dag', () => {
    const state = snoozePushUntilTomorrow(EMPTY_PUSH_STATE, today);
    expect(state.snoozedUntil).toBe('2026-11-20');
    expect(shouldAutoShowPushGuide({ ...base, state })).toBe(false);
    expect(shouldAutoShowPushGuide({ ...base, state, today: '2026-11-20' })).toBe(true);
  });
  it('visas inte i en session där kalenderguiden visas automatiskt', () => {
    expect(shouldAutoShowPushGuide({ ...base, calendarGuideThisSession: true })).toBe(false);
  });
  it('visas inte när enheten är klar', () => {
    expect(shouldAutoShowPushGuide({ ...base, state: { ...EMPTY_PUSH_STATE, done: true } })).toBe(false);
  });
});

describe('enhetens tillstånd', () => {
  it('nyckel per användare och tålig tolkning', () => {
    expect(pushStorageKey('Anna')).toBe('smartklimat_notiser_Anna');
    expect(parsePushState(null)).toEqual(EMPTY_PUSH_STATE);
    expect(parsePushState('{trasig')).toEqual(EMPTY_PUSH_STATE);
    expect(parsePushState('{"done":true,"snoozedUntil":"2026-11-20","shownCount":2}')).toEqual({ done: true, snoozedUntil: '2026-11-20', shownCount: 2 });
    expect(parsePushState('{"snoozedUntil":"i morgon","shownCount":-1}')).toEqual(EMPTY_PUSH_STATE);
  });
  it('klarmarkeringen följer status', () => {
    expect(reconcilePushState(EMPTY_PUSH_STATE, 'on').done).toBe(true);
    const done = { ...EMPTY_PUSH_STATE, done: true };
    expect(reconcilePushState(done, 'off').done).toBe(false);
    expect(reconcilePushState(done, 'blocked').done).toBe(false);
    expect(reconcilePushState(done, 'on')).toBe(done);
    expect(reconcilePushState(done, null)).toBe(done);
  });
});
