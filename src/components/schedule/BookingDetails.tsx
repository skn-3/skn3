import { useEffect, useState } from 'react';
import { AlertTriangle, Navigation, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  KIND_LABELS, UNBOOK_TEXT, UNBOOK_TITLE, deliveryGroupLabels, deliveryLabelOf, detailActions, placeLabel, whenLabel,
  type ConflictResult, type DeliveryGroup, type ScheduleCase, type ScheduleEvent,
} from '@/lib/schedule';

const NO_TEAM = '__inget__';

interface Props {
  event: ScheduleEvent;
  caseData: (ScheduleCase & { montor_notes?: string | null }) | null;
  today: string;
  teamNames: string[];
  conflicts: ConflictResult;
  busy: boolean;
  onClose: () => void;
  onReschedule: () => void;
  onOpenCase: () => void;
  onChangeTeam: (team: string | null) => void;
  onUnbook: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function BookingDetails({ event, caseData, today, teamNames, conflicts, busy, onClose, onReschedule, onOpenCase, onChangeTeam, onUnbook }: Props) {
  const actions = detailActions(event);
  const [teamEdit, setTeamEdit] = useState(false);
  const [team, setTeam] = useState<string | null>(event.team);
  const [confirmUnbook, setConfirmUnbook] = useState(false);
  useEffect(() => { setTeamEdit(false); setConfirmUnbook(false); setTeam(event.team); }, [event.id, event.team]);
  const delivery = caseData ? deliveryLabelOf(caseData, today) : null;
  const meta = [event.city, event.units != null ? `${event.units} enheter` : null].filter(Boolean).join(' · ');
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(placeLabel(event.address, event.city))}`;
  const clashes = conflicts.byEvent.get(event.id) ?? [];

  return (
    <section aria-labelledby="schedule-details-title" className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Chip tone={event.kind === 'leverans' ? 'info' : event.kind === 'km' ? 'sage' : event.kind === 'montage' ? 'success' : 'neutral'}>{KIND_LABELS[event.kind]}</Chip>
          <StatusChip status={event.status} />
        </div>
        <Button variant="ghost" size="icon" className="ml-auto h-11 w-11 shrink-0" onClick={onClose} aria-label="Stäng detaljerna">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div>
        <h2 id="schedule-details-title" className="font-semibold">{event.address}</h2>
        {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
      </div>

      {clashes.length > 0 && (
        <div className="flex gap-2 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <ul>{clashes.map(p => { const other = p.a.id === event.id ? p.b : p.a; return <li key={other.id}>Krockar med {placeLabel(other.address, other.city)}</li>; })}</ul>
        </div>
      )}

      <dl className="divide-y divide-border">
        <Row label="När"><span className="font-mono text-[13px]">{whenLabel(event, today)}</span></Row>
        <Row label="Team">{event.team ?? 'Inget team'}</Row>
        <Row label="Kund">{event.customerName || 'Saknas'}</Row>
        <Row label="Telefon">
          {event.customerPhone ? <a className="font-semibold text-primary underline-offset-2 hover:underline" href={`tel:${event.customerPhone.replace(/\s+/g, '')}`}>{event.customerPhone}</a> : 'Saknas'}
        </Row>
        {delivery && <Row label="Leverans">{delivery}</Row>}
        {caseData?.montor_notes && <Row label="Till montör"><span className="whitespace-pre-line">{caseData.montor_notes}</span></Row>}
      </dl>

      <Button variant="outline" className="min-h-11 justify-start" asChild>
        <a href={mapsUrl} target="_blank" rel="noopener"><Navigation className="h-4 w-4" /> Vägbeskrivning</a>
      </Button>

      {teamEdit && (
        <div className="grid gap-2 rounded-lg border border-border p-3">
          <Select value={team ?? NO_TEAM} onValueChange={v => setTeam(v === NO_TEAM ? null : v)}>
            <SelectTrigger className="h-11 text-base" aria-label="Nytt team"><SelectValue /></SelectTrigger>
            <SelectContent>
              {event.kind === 'km' && <SelectItem value={NO_TEAM} className="min-h-11">Inget team</SelectItem>}
              {teamNames.map(t => <SelectItem key={t} value={t} className="min-h-11">{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button className="min-h-11 flex-1" disabled={busy || team === event.team || (event.kind === 'montage' && !team)} onClick={() => onChangeTeam(team)}>
              {busy ? 'Sparar...' : 'Spara'}
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => { setTeamEdit(false); setTeam(event.team); }}>Avbryt</Button>
          </div>
        </div>
      )}

      {confirmUnbook ? (
        <div className="grid gap-2 rounded-lg border border-destructive/40 bg-destructive-soft p-3 text-foreground" role="alertdialog" aria-labelledby="schedule-unbook-title" aria-describedby="schedule-unbook-text">
          <p id="schedule-unbook-title" className="font-display font-semibold">{UNBOOK_TITLE}</p>
          <p id="schedule-unbook-text" className="text-sm">{UNBOOK_TEXT}</p>
          <div className="flex gap-2">
            <Button variant="destructive" className="min-h-11 flex-1" disabled={busy} onClick={onUnbook} autoFocus>{busy ? 'Tar bort...' : 'Ta bort bokningen'}</Button>
            <Button variant="outline" className="min-h-11" onClick={() => setConfirmUnbook(false)}>Avbryt</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {actions.reschedule && <Button className="min-h-11" onClick={onReschedule}>Boka om</Button>}
          {actions.changeTeam && !teamEdit && <Button variant="outline" className="min-h-11" onClick={() => setTeamEdit(true)}>Byt team</Button>}
          {actions.open && <Button variant="outline" className="min-h-11" onClick={onOpenCase} disabled={!caseData}>Öppna ärendet</Button>}
          {actions.unbook && <Button variant="outline" className="min-h-11 text-destructive" onClick={() => setConfirmUnbook(true)}>Ta bort bokningen</Button>}
        </div>
      )}
    </section>
  );
}

export function DeliveryGroupDetails({ group, today, onClose, onSelectEvent }: { group: DeliveryGroup; today: string; onClose: () => void; onSelectEvent: (id: string) => void }) {
  const labels = deliveryGroupLabels(group);
  return (
    <section aria-labelledby="schedule-group-title" className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div>
          <Chip tone="info">Leverans</Chip>
          <h2 id="schedule-group-title" className="mt-2 font-display text-lg font-semibold">{labels.title}</h2>
          <p className="text-sm text-muted-foreground">{labels.sub}</p>
        </div>
        <Button variant="ghost" size="icon" className="ml-auto h-11 w-11 shrink-0" onClick={onClose} aria-label="Stäng detaljerna">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {group.events.map(e => (
          <li key={e.id}>
            <button type="button" onClick={() => onSelectEvent(e.id)} className="flex min-h-[52px] w-full flex-col justify-center rounded-lg border border-border bg-card px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="font-semibold">{e.address}</span>
              <span className="text-sm text-muted-foreground">{[e.city, e.team, whenLabel(e, today)].filter(Boolean).join(' · ')}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
