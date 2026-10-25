import { describe, expect, it } from 'vitest';
import { AlertTriangle, Calendar, FileText, Hammer, MessageSquare, Ruler, Wrench } from 'lucide-react';
import { notificationIcon } from '../notificationKinds';

describe('notificationIcon', () => {
  it.each([
    ['a_order_sent', FileText], ['a_order_invoiced', FileText], ['a_order_paid', FileText], ['a_order_future', FileText],
    ['deviation', AlertTriangle], ['deviation_next_step', AlertTriangle], ['deviation_resolved', AlertTriangle], ['cost', AlertTriangle],
    ['sheet_metal', Hammer],
    ['kontrollmatning', Ruler], ['km_booked_by_montor', Ruler], ['km_klar', Ruler],
    ['note', MessageSquare], ['montor_event', MessageSquare],
    ['montage_delrapport', Wrench],
    ['montage_pagar', Wrench], ['montage_klart', Wrench], ['montage_booked', Wrench], ['montage_booked_by_montor', Wrench], ['montage_rescheduled', Wrench],
    ['case_assigned', Calendar], ['km_assigned', Calendar], ['vantar_godkannande', Calendar], ['unknown', Calendar],
  ])('%s uses the expected icon', (kind, icon) => {
    expect(notificationIcon(kind as string)).toBe(icon);
  });
});