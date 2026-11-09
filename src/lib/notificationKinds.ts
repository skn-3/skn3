import { AlertTriangle, Calendar, FileText, Hammer, MessageSquare, Ruler, Truck, Wrench, type LucideIcon } from 'lucide-react';

export function notificationIcon(kind: string): LucideIcon {
  if (kind.startsWith('a_order')) return FileText;
  if (kind.includes('deviation') || kind === 'cost') return AlertTriangle;
  if (kind === 'sheet_metal') return Hammer;
  if (kind.startsWith('waste_pickup')) return Truck;
  if (['kontrollmatning', 'km_booked_by_montor', 'km_klar'].includes(kind)) return Ruler;
  if (['note', 'montor_event'].includes(kind)) return MessageSquare;
  if (['montage_pagar', 'montage_klart', 'montage_booked', 'montage_booked_by_montor', 'montage_rescheduled', 'montage_delrapport'].includes(kind)) return Wrench;
  return Calendar;
}