import { useEffect, useRef, useState } from 'react';
import { usePush, usePushSync } from '@/hooks/usePush';
import { usePushDevice } from '@/hooks/usePushDevice';
import { useCalendarDevice, useCalendarSettings } from '@/hooks/useCalendar';
import { shouldAutoShowGuide } from '@/lib/calendar/popup';
import { OPEN_PUSH_GUIDE_EVENT, markPushShown, reconcilePushState, shouldAutoShowPushGuide, snoozePushUntilTomorrow } from '@/lib/push/guide';
import { toIso } from '@/lib/schedule';
import type { UserRole } from '@/lib/constants';
import { PushGuideDialog } from './PushGuideDialog';

interface Props {
  role: UserRole;
  /** PIN-byte och välkomstskärm är avgjorda och vyn visas; guiden visas aldrig automatiskt ovanpå dem. */
  autoAllowed: boolean;
  /** Ärendelänk som håller på att öppnas (samma villkor som kalenderguiden i MontorView). */
  initialCaseId: string | null;
}

/**
 * En instans i det inloggade Index-skalet: synkar enhetens prenumeration, öppnar guiden "Notiser" från menyn och
 * chattlistan och visar den automatiskt. För montörer avgörs kalenderguiden med samma rena funktion och hooks som
 * MontorView, i samma ögonblick som MontorView avgör den; visas den automatiskt väntar notisguiden till en senare session.
 */
export function PushGuideHost({ role, autoAllowed, initialCaseId }: Props) {
  usePushSync();
  const push = usePush();
  const [open, setOpen] = useState(false);
  const [device, updateDevice] = usePushDevice(role.name);
  const isMontor = role.type === 'montor';
  const [calendarDevice] = useCalendarDevice(role.name);
  const calendarSettings = useCalendarSettings(isMontor);
  const calendarDecision = useRef<boolean | null>(null);
  const decided = useRef(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_PUSH_GUIDE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PUSH_GUIDE_EVENT, onOpen);
  }, []);

  // Klarmarkeringen följer enhetens status.
  useEffect(() => {
    if (!push.checked) return;
    const next = reconcilePushState(device, push.status);
    if (next !== device) updateDevice(() => next);
  }, [push.checked, push.status, device, updateDevice]);

  // Kalenderguidens beslut, med enhetens tillstånd från samma rendering som MontorView använder.
  useEffect(() => {
    if (calendarDecision.current !== null || !autoAllowed || initialCaseId) return;
    if (!isMontor) { calendarDecision.current = false; return; }
    if (!calendarSettings.isFetched) return;
    calendarDecision.current = shouldAutoShowGuide({ role: role.type, popupEnabled: calendarSettings.data?.popup_enabled, state: calendarDevice, today: toIso(new Date()) });
  }, [autoAllowed, initialCaseId, isMontor, calendarSettings.isFetched, calendarSettings.data, calendarDevice, role.type]);

  useEffect(() => {
    if (decided.current || !autoAllowed || initialCaseId || calendarDecision.current === null || !push.checked) return;
    decided.current = true;
    if (shouldAutoShowPushGuide({ status: push.status, state: device, today: toIso(new Date()), calendarGuideThisSession: calendarDecision.current })) {
      updateDevice(markPushShown);
      setOpen(true);
    }
  });

  return (
    <PushGuideDialog
      open={open}
      onOpenChange={setOpen}
      onSnooze={() => { updateDevice((s) => snoozePushUntilTomorrow(s, toIso(new Date()))); setOpen(false); }}
    />
  );
}
