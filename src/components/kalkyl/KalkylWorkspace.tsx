import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Info, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  addAdjustment, addCommonLine, addFriLine, addRoom, addRow, defaultDisplay, duplicateRow, indexPrices, insertRow, isLocalNewer,
  kalkylFromRow, kalkylSaveFields, moveRow, newFriRow, newGolvRow, newMalningRow, newRoom, offerEditMode, offerMetaFromRow,
  offerOptions, offerScopeText, priceChanges, removeAdjustment, removeCommonLine, removeFriLine, removeRow, repriceKalkyl, roomOf,
  runKontroller, setOverride, toggleFavorite, updateFriLine, updateRoom, updateRowInput, updateRowMeta, validateMeta,
  DEFAULT_KALKYL_SETTINGS, type KalkylData, type Kulor, type OfferMeta, type PriceDisplay,
} from '@/lib/kalkyl';
import { fetchKalkylSettings, fetchPriceItems, KALKYL_SETTINGS_KEY, PRICE_ITEMS_KEY } from '@/components/offers/priceList/api';
import { PriceListAdmin } from '@/components/offers/PriceListAdmin';
import { KalkylUiProvider, type KalkylUi } from './context';
import { TopBar } from './TopBar';
import { FactStrip } from './FactStrip';
import { OfferDetailsSheet } from './OfferDetailsSheet';
import { CommonSection, EmptyKalkyl, OverviewHeader, OverviewRow, type RowActions } from './Overview';
import { InternalCard, KontrollCard, SummaryBar, SummaryCard } from './SummaryAside';
import { AddRowSheet, type AddRequest } from './AddRowSheet';
import { AdjustmentSheet, CommonLineSheet } from './LineSheets';
import { GolvConfigurator } from './GolvConfigurator';
import { MalningConfigurator, type Surface } from './MalningConfigurator';
import { FriConfigurator } from './FriConfigurator';
import { Gallery, type GalleryTarget } from './Gallery';
import { clearLocalDraft, readLocalDraft, saveKalkylOffer, writeLocalDraft, type LocalDraft } from './api';
import { timeLabel } from './format';

type OfferRow = Record<string, unknown> & { id?: string };
type View = { kind: 'overview' } | { kind: 'row'; rowId: string } | { kind: 'gallery'; target: GalleryTarget | null; from: 'overview' | 'row' };

const TRADE_TITLE = { golv: 'Golv', malning: 'Målning', fri: 'Fri rad' } as const;
const todayIso = () => new Date().toISOString().slice(0, 10);

export interface KalkylWorkspaceProps {
  offer: OfferRow | null;
  currentUser: string;
  onClose: () => void;
  /** Efter "Klar": kalkylen är sparad, öppna offertformuläret för samma offert. */
  onDone: (offerId: string) => void;
  onSaved?: () => void;
}

export function KalkylWorkspace({ offer, currentUser, onClose, onDone, onSaved }: KalkylWorkspaceProps) {
  const qc = useQueryClient();
  const pricesQ = useQuery({ queryKey: PRICE_ITEMS_KEY, queryFn: fetchPriceItems });
  const settingsQ = useQuery({ queryKey: KALKYL_SETTINGS_KEY, queryFn: fetchKalkylSettings });

  const [offerId, setOfferId] = useState<string | null>((offer?.id as string) ?? null);
  const [offerNumber, setOfferNumber] = useState<string | null>((offer?.offer_number as string) ?? null);
  const [status, setStatus] = useState<string>((offer?.status as string) ?? 'draft');
  const [data, setDataRaw] = useState<KalkylData>(() => kalkylFromRow(offer));
  const [meta, setMetaRaw] = useState<OfferMeta>(() => offerMetaFromRow(offer));
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(offer?.updated_at ? new Date(offer.updated_at as string) : null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<View>({ kind: 'overview' });
  const [customerMode, setCustomerMode] = useState(false);
  const [display, setDisplay] = useState<PriceDisplay>(defaultDisplay(meta.customer_type));
  const [detailsOpen, setDetailsOpen] = useState(!offer);
  const [nameError, setNameError] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [commonOpen, setCommonOpen] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);
  const [priceListOpen, setPriceListOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [surface, setSurface] = useState<Surface>('vagg');
  const [localDraft, setLocalDraft] = useState<LocalDraft | null>(() => {
    const local = readLocalDraft((offer?.id as string) ?? null);
    return local && isLocalNewer(local.saved_at, (offer?.updated_at as string) ?? null) ? local : null;
  });
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const mode = offerEditMode(status);
  const readOnly = mode === 'readonly';
  const items = useMemo(() => pricesQ.data ?? [], [pricesQ.data]);
  const prices = useMemo(() => indexPrices(items), [items]);
  const settings = settingsQ.data ?? DEFAULT_KALKYL_SETTINGS;
  const opts = useMemo(() => offerOptions(meta), [meta]);
  const today = todayIso();
  const kontroller = useMemo(() => runKontroller(data, prices, settings, today), [data, prices, settings, today]);
  const changes = useMemo(() => (pricesQ.data && status === 'draft' && offerId ? priceChanges(data, prices) : []), [data, prices, pricesQ.data, status, offerId]);

  // Ändringar sparas lokalt på enheten, fördröjt 500 ms.
  const setData = useCallback((fn: (d: KalkylData) => KalkylData) => {
    if (readOnly) return;
    setDataRaw(prev => { const next = fn(prev); if (next !== prev) setDirty(true); return next; });
  }, [readOnly]);
  const setMeta = useCallback((patch: Partial<OfferMeta>) => {
    if (readOnly) return;
    setMetaRaw(prev => ({ ...prev, ...patch }));
    setDirty(true);
    if (patch.customer_name?.trim()) setNameError(false);
    if (patch.customer_type) setDisplay(defaultDisplay(patch.customer_type));
  }, [readOnly]);
  useEffect(() => {
    if (!dirty || readOnly) return;
    const t = setTimeout(() => writeLocalDraft(offerId, { saved_at: new Date().toISOString(), data, meta }), 500);
    return () => clearTimeout(t);
  }, [data, meta, dirty, offerId, readOnly]);

  const save = useCallback(async (): Promise<string | null> => {
    if (readOnly) return offerId;
    if (validateMeta(meta).length) { setNameError(true); setDetailsOpen(true); toast.error('Ange kundens namn innan du sparar.'); return null; }
    setSaving(true);
    try {
      const fields = kalkylSaveFields(meta, data, prices, settings);
      const saved = await saveKalkylOffer(offerId, fields, currentUser);
      if (!offerId) clearLocalDraft(null);
      clearLocalDraft(saved.id);
      setOfferId(saved.id);
      setOfferNumber(saved.offer_number);
      setStatus(saved.status);
      setMetaRaw(m => ({ ...m, title: fields.title, description: fields.description ?? '' }));
      setSavedAt(saved.updated_at ? new Date(saved.updated_at) : new Date());
      setDirty(false);
      setLocalDraft(null);
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['case_offers'] });
      onSaved?.();
      return saved.id;
    } catch (e) {
      toast.error(`Kunde inte spara offerten. ${(e as Error)?.message ?? ''} Ändringarna finns kvar på enheten, försök igen.`);
      return null;
    } finally {
      setSaving(false);
    }
  }, [readOnly, meta, data, prices, settings, offerId, currentUser, qc, onSaved]);

  const handleSave = async () => { const id = await save(); if (id) toast.success('Kalkylen är sparad'); };
  const handleDone = async () => {
    if (view.kind !== 'overview') { setView({ kind: 'overview' }); return; }
    if (readOnly) { if (offerId) onDone(offerId); else onClose(); return; }
    const id = await save();
    if (id) onDone(id);
  };
  const handleClose = () => {
    if (dirty && !readOnly) toast.info('Osparade ändringar finns kvar på den här enheten.');
    onClose();
  };

  // ── Radåtgärder ───────────────────────────────────────────────────────────
  const rowActions: RowActions = {
    onConfigure: rowId => setView({ kind: 'row', rowId }),
    onChangeMaterial: rowId => openGalleryFor(rowId, 'overview'),
    onDuplicate: rowId => { setData(d => duplicateRow(d, rowId)); toast.success('Raden är duplicerad'); },
    onMove: (rowId, dir) => setData(d => moveRow(d, rowId, dir)),
    onRemove: rowId => {
      const index = data.rows.findIndex(r => r.id === rowId);
      const row = data.rows[index];
      if (!row) return;
      setData(d => removeRow(d, rowId));
      setExpanded(null);
      toast('Raden är borttagen', { action: { label: 'Ångra', onClick: () => setData(d => insertRow(d, row, index)) }, duration: 8000 });
    },
  };

  const openGalleryFor = (rowId: string, from: 'overview' | 'row') => {
    const row = data.rows.find(r => r.id === rowId);
    if (!row) return;
    const room = roomOf(data, row);
    const label = `${room?.name ?? row.title} · ${TRADE_TITLE[row.trade]}`;
    if (row.trade === 'golv') setView({ kind: 'gallery', from, target: { kind: 'golv', rowId, label, current: (row.input as { material_code: string }).material_code } });
    else if (row.trade === 'malning') setView({ kind: 'gallery', from, target: { kind: 'kulor', rowId, label: `${label}, väggar`, current: (row.input as { kulor_vagg?: Kulor | null }).kulor_vagg?.code ?? null } });
  };

  const handleAdd = (req: AddRequest) => {
    let roomId = req.roomId;
    let next = data;
    if (req.newRoom) { const room = newRoom(req.newRoom.name, req.newRoom.dims); next = addRoom(next, room); roomId = room.id; }
    const firstGolv = items.find(i => i.slot === 'golv.golvtyp' && i.status !== 'arkiverad');
    const row = req.kind === 'golv' ? newGolvRow(roomId!, firstGolv?.code ?? '')
      : req.kind === 'malning' ? newMalningRow(roomId!)
      : newFriRow(roomId, req.friTitle || 'Fri rad');
    next = addRow(next, row, prices, settings);
    setData(() => next);
    setAddOpen(false);
    setSurface('vagg');
    setView({ kind: 'row', rowId: row.id });
  };

  const showRow = (rowId: string) => {
    setView({ kind: 'overview' });
    setExpanded(rowId);
    requestAnimationFrame(() => rowRefs.current.get(rowId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const restoreLocal = () => { if (!localDraft) return; setDataRaw(localDraft.data); setMetaRaw(localDraft.meta); setDirty(true); setLocalDraft(null); };
  const discardLocal = () => { clearLocalDraft(offerId); setLocalDraft(null); };

  const ui: KalkylUi = { customerMode, readOnly, display, prices, items, settings, opts, today };
  const loading = pricesQ.isLoading || settingsQ.isLoading;
  const loadError = pricesQ.error || settingsQ.error;

  const offerLabel = offerNumber ? `Offert ${offerNumber}` : 'Ny offert';
  const currentRow = view.kind === 'row' ? data.rows.find(r => r.id === view.rowId) ?? null : null;
  const currentRoom = currentRow ? roomOf(data, currentRow) : null;

  const banners = (
    <>
      {localDraft && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-warning-soft px-4 py-3 text-sm text-warning-ink" role="status">
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-[200px]">Det finns en osparad version från kl. {timeLabel(localDraft.saved_at)} på den här enheten.</span>
          <Button type="button" size="sm" className="min-h-[44px]" onClick={restoreLocal}>Återställ</Button>
          <Button type="button" size="sm" variant="outline" className="min-h-[44px]" onClick={discardLocal}>Släng</Button>
        </div>
      )}
      {changes.length > 0 && !readOnly && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning-ink" aria-hidden="true" />
          <span className="flex-1 min-w-[200px]">{changes.length} {changes.length === 1 ? 'pris har' : 'priser har'} ändrats sedan kalkylen sparades.</span>
          <Button type="button" size="sm" className="min-h-[44px]" onClick={() => { setData(d => repriceKalkyl(d, prices, settings, new Date())); toast.success('Priserna är uppdaterade'); }}>Uppdatera priser</Button>
        </div>
      )}
      {mode === 'sent' && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-info-soft px-4 py-3 text-sm text-info" role="status">
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" /> Offerten är skickad. Ändringar gäller när du skickar den igen.
        </div>
      )}
      {readOnly && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm" role="status">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" /> Offerten är accepterad och kan inte ändras här.
        </div>
      )}
    </>
  );

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <p className="font-semibold">Prislistan kunde inte hämtas.</p>
          <p className="text-sm text-muted-foreground">Kontrollera anslutningen och försök igen.</p>
          <Button type="button" className="min-h-[44px]" onClick={() => { pricesQ.refetch(); settingsQ.refetch(); }}>Försök igen</Button>
        </div>
      </div>
    );
  } else if (loading) {
    body = (
      <div className="flex-1 p-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]" aria-busy="true" aria-label="Laddar kalkylen">
        <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[72px] w-full rounded-xl" />)}</div>
        <Skeleton className="hidden lg:block h-80 w-full rounded-xl" />
      </div>
    );
  } else if (view.kind === 'gallery') {
    body = (
      <Gallery
        target={view.target}
        favorites={data.favorites ?? []}
        onToggleFavorite={code => setData(d => toggleFavorite(d, code))}
        onBack={() => setView(view.from === 'row' && view.target ? { kind: 'row', rowId: view.target.rowId } : { kind: 'overview' })}
        onUseGolv={(rowId, code) => { setData(d => updateRowInput(d, rowId, { material_code: code }, prices, settings)); setView(view.from === 'row' ? { kind: 'row', rowId } : { kind: 'overview' }); }}
        onUseKulor={(rowId, k) => { setData(d => updateRowInput(d, rowId, { kulor_vagg: k }, prices, settings)); setView(view.from === 'row' ? { kind: 'row', rowId } : { kind: 'overview' }); }}
      />
    );
  } else if (view.kind === 'row' && currentRow) {
    const rowId = currentRow.id;
    const roomPatch = (patch: Parameters<typeof updateRoom>[2]) => currentRoom && setData(d => updateRoom(d, currentRoom.id, patch, prices, settings));
    const common = {
      onOverride: (key: string, o: Parameters<typeof setOverride>[3]) => setData(d => setOverride(d, rowId, key, o)),
      onAddOwn: (l: Parameters<typeof addFriLine>[2]) => setData(d => addFriLine(d, rowId, l)),
      onRemoveOwn: (key: string) => setData(d => removeFriLine(d, rowId, key)),
      onFix: (fix: { patch: Parameters<typeof updateRowInput>[2] }) => setData(d => updateRowInput(d, rowId, fix.patch, prices, settings)),
    };
    body = currentRow.trade === 'golv' && currentRoom ? (
      <GolvConfigurator data={data} row={currentRow} room={currentRoom} kontroller={kontroller}
        actions={{ ...common, onRoom: roomPatch, onInput: p => setData(d => updateRowInput(d, rowId, p, prices, settings)), onGallery: () => openGalleryFor(rowId, 'row') }} />
    ) : currentRow.trade === 'malning' && currentRoom ? (
      <MalningConfigurator data={data} row={currentRow} room={currentRoom} kontroller={kontroller} surface={surface} onSurface={setSurface}
        actions={{ ...common, onRoom: roomPatch, onInput: p => setData(d => updateRowInput(d, rowId, p, prices, settings)) }} />
    ) : (
      <FriConfigurator data={data} row={currentRow} room={currentRoom} kontroller={kontroller}
        actions={{
          onTitle: t => setData(d => updateRowMeta(d, rowId, { title: t })),
          onAdd: l => setData(d => addFriLine(d, rowId, l)),
          onUpdate: (key, p) => setData(d => updateFriLine(d, rowId, key, p)),
          onRemove: key => setData(d => removeFriLine(d, rowId, key)),
          onFix: common.onFix,
        }} />
    );
  } else {
    const aside = (
      <>
        <SummaryCard data={data} display={display} onDisplay={setDisplay} />
        <InternalCard data={data} onOpenPriceList={() => setPriceListOpen(true)} />
        <KontrollCard data={data} kontroller={kontroller} onShowRow={showRow} />
      </>
    );
    body = (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="lg:min-h-0 lg:overflow-y-auto p-3 sm:p-4 space-y-3">
            {banners}
            <OverviewHeader count={data.rows.length} onGallery={() => setView({ kind: 'gallery', target: null, from: 'overview' })} onAdd={() => setAddOpen(true)} readOnly={readOnly} />
            {data.rows.length === 0 ? <EmptyKalkyl onAdd={() => setAddOpen(true)} readOnly={readOnly} /> : (
              <div className="space-y-2">
                {data.rows.map((row, i) => (
                  <OverviewRow key={row.id} ref={el => { if (el) rowRefs.current.set(row.id, el); else rowRefs.current.delete(row.id); }}
                    data={data} row={row} kontroller={kontroller} expanded={expanded === row.id} onToggle={() => setExpanded(e => (e === row.id ? null : row.id))}
                    actions={rowActions} index={i} count={data.rows.length} />
                ))}
              </div>
            )}
            <CommonSection data={data} onAddCommon={() => setCommonOpen(true)} onAddAdjustment={() => setAdjOpen(true)}
              onRemoveCommon={key => setData(d => removeCommonLine(d, key))} onRemoveAdjustment={id => setData(d => removeAdjustment(d, id))} />
            <div className="lg:hidden space-y-3 pb-2">
              <InternalCard data={data} onOpenPriceList={() => setPriceListOpen(true)} />
              <KontrollCard data={data} kontroller={kontroller} onShowRow={showRow} />
            </div>
          </div>
          <aside className="hidden lg:block lg:min-h-0 lg:overflow-y-auto border-l border-border bg-background p-4 space-y-3" aria-label="Summering och kontroll">{aside}</aside>
        </div>
        <SummaryBar data={data} display={display} onDisplay={setDisplay} />
      </div>
    );
  }

  const inRow = view.kind === 'row' && currentRow;
  return (
    <DialogPrimitive.Root open onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-background text-foreground outline-none"
          onEscapeKeyDown={e => { if (view.kind !== 'overview') { e.preventDefault(); setView(view.kind === 'gallery' && view.from === 'row' && view.target ? { kind: 'row', rowId: view.target.rowId } : { kind: 'overview' }); } }}
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">Kalkyl {offerLabel}</DialogPrimitive.Title>
          <KalkylUiProvider value={ui}>
            {view.kind !== 'gallery' && (
              <TopBar
                backLabel={inRow ? `Tillbaka till ${offerLabel}` : 'Stäng kalkylen'}
                onBack={inRow ? () => setView({ kind: 'overview' }) : handleClose}
                eyebrow={inRow ? offerLabel : 'SmartKlimat N3prenad'}
                title={inRow ? `${currentRoom?.name ?? currentRow.title} · ${currentRow.trade === 'fri' ? currentRow.title : TRADE_TITLE[currentRow.trade]}` : offerLabel}
                status={inRow ? null : status}
                savedAt={savedAt}
                dirty={dirty}
                customerMode={customerMode}
                onCustomerMode={setCustomerMode}
                onSave={handleSave}
                showSave={!inRow}
                onDone={handleDone}
                saving={saving}
                readOnly={readOnly}
              />
            )}
            {view.kind === 'overview' && <FactStrip meta={meta} data={data} onEdit={() => setDetailsOpen(true)} readOnly={readOnly} />}
            <main className={cn('flex-1 min-h-0 flex flex-col')}>{body}</main>
            <OfferDetailsSheet open={detailsOpen} onOpenChange={setDetailsOpen} meta={meta} onMeta={setMeta} premises={data.premises}
              onPremises={p => setData(d => ({ ...d, premises: { ...d.premises, ...p } }))} nameError={nameError} readOnly={readOnly} isNew={!offerId}
              onFillDescription={() => { setMeta({ description: offerScopeText(data, prices, settings) }); toast.success('Beskrivningen är ifylld från kalkylen'); }} />
            <AddRowSheet open={addOpen} onOpenChange={setAddOpen} rooms={data.rooms} onAdd={handleAdd} />
            <CommonLineSheet open={commonOpen} onOpenChange={setCommonOpen} onAdd={v => { setData(d => addCommonLine(d, v)); setCommonOpen(false); }} />
            <AdjustmentSheet open={adjOpen} onOpenChange={setAdjOpen} onAdd={a => { setData(d => addAdjustment(d, a)); setAdjOpen(false); }} />
            <Sheet open={priceListOpen} onOpenChange={o => { setPriceListOpen(o); if (!o) qc.invalidateQueries({ queryKey: PRICE_ITEMS_KEY }); }}>
              <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
                <SheetHeader><SheetTitle className="font-display text-xl">Prislista</SheetTitle></SheetHeader>
                <div className="mt-4"><PriceListAdmin currentUser={currentUser} /></div>
              </SheetContent>
            </Sheet>
          </KalkylUiProvider>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
