// "Förhandsvisa": kundvyn byggd från kalkylen som den är just nu (osparade ändringar syns).
// Visar bara det kunden ser – inga interna uppgifter, oavsett kundläge. Räknar inget själv.
// När kalkylen går att ändra kan säljaren lägga till ett tillval i offerten härifrån (setRowOptional via onSetOptional);
// kunden kan aldrig välja tillval på sin sida.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SignedImage } from '@/components/shared/SignedImage';
import { CustomerOfferOptions, CustomerOfferSections, CustomerPriceRows } from '@/components/public/CustomerOfferSections';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  buildCustomerView, customerPayment, customerPriceRows, customerSectionHeading, kalkylTotals,
  type KalkylData, type KalkylOfferOptions, type KalkylSettings, type PriceIndex,
} from '@/lib/kalkyl';

const fmtKr = (n: number | null | undefined) => Number(n || 0).toLocaleString('sv-SE', { maximumFractionDigits: 0 }) + ' kr';
const Num = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`font-mono tabular whitespace-nowrap ${className}`}>{children}</span>
);

export function CustomerPreviewSheet({ open, onOpenChange, data, prices, settings, opts, description, onSetOptional }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  data: KalkylData; prices: PriceIndex; settings: KalkylSettings; opts: KalkylOfferOptions; description: string;
  /** Gör en kalkylrad till tillval eller vanlig rad (setRowOptional). Saknas i skrivskyddat läge. */
  onSetOptional?: (rowId: string, optional: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const view = useMemo(() => (open ? buildCustomerView(data, prices, settings, description) : null), [open, data, prices, settings, description]);
  const pay = useMemo(() => (open ? customerPayment(kalkylTotals(data, opts), opts) : null), [open, data, opts]);
  const shown = (exVat: number) => fmtKr(exVat * (pay?.price_factor ?? 1));
  const editable = !!onSetOptional;

  // Senast tillagda tillvalet (för "Ångra"). Försvinner när panelen stängs eller ett annat tillval läggs till.
  const [added, setAdded] = useState<{ id: string; heading: string } | null>(null);
  // Fokus sätts aldrig programmatiskt på en knapp som ändrar kalkylen (mellanslag/Enter skulle då ändra offerten
  // utan synlig markering). Bara panelen, statusraden och avsnittet Tillval får fokus i koden (tabIndex -1).
  const contentRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLElement>(null);
  const focusOptions = useRef(false);
  // Panelen öppnas utan Radix-trigger, så knappen som öppnade den ("Förhandsvisa") sparas och får fokus igen vid stängning.
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => { if (!open) setAdded(null); }, [open]);
  useEffect(() => { if (added) statusRef.current?.focus(); }, [added]);
  useEffect(() => {
    // Efter "Ångra": fokus till avsnittet Tillval, inte till någon knapp.
    if (!focusOptions.current || !optionsRef.current) return;
    focusOptions.current = false;
    optionsRef.current.focus();
  });
  const addOption = (id: string, heading: string) => { onSetOptional?.(id, false); setAdded({ id, heading }); };
  const undo = () => {
    if (!added) return;
    onSetOptional?.(added.id, true);
    focusOptions.current = true;
    setAdded(null);
  };
  const showOptions = view ? view.options.length > 0 || (editable && !!added) : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent ref={contentRef} tabIndex={-1}
        onOpenAutoFocus={e => {
          e.preventDefault();
          const prev = document.activeElement;
          returnFocus.current = prev instanceof HTMLElement && prev !== document.body ? prev : null;
          contentRef.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={e => {
          const el = returnFocus.current;
          returnFocus.current = null;
          if (el?.isConnected) { e.preventDefault(); el.focus(); }
        }}
        side={isMobile ? 'bottom' : 'right'} className={cn('overflow-y-auto outline-none', isMobile ? 'max-h-[92dvh]' : 'w-full sm:max-w-2xl')}>
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-2xl">Kundens offert</SheetTitle>
          <SheetDescription>Så här ser kunden offerten.</SheetDescription>
        </SheetHeader>
        {view && pay && (
          <div className="mt-5 space-y-6">
            <section aria-label="Det här ingår">
              <div className="text-[11px] font-bold tracking-[.12em] uppercase text-gold-ink">Omfattning</div>
              <h2 className="font-display text-[22px] font-bold mt-1 mb-3">Det här ingår</h2>
              {view.sections.length === 0 && view.common.length === 0
                ? <p className="text-sm text-muted-foreground">Kalkylen har inga rader ännu.</p>
                : <CustomerOfferSections view={view} formatAmount={shown}
                    renderImage={(item, className) => <SignedImage value={item.image_path} bucket="catalog-images" alt="" className={className} />} />}
            </section>
            {showOptions && (
              <section ref={optionsRef} tabIndex={-1} aria-label="Tillval" className="space-y-3 outline-none">
                {editable && added && (
                  <div ref={statusRef} tabIndex={-1} role="status" className="outline-none flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5">
                    <span className="text-[14.5px] min-w-0">Tillagt i offerten: <b className="font-semibold">{added.heading}</b></span>
                    <Button type="button" variant="outline" className="min-h-[44px]" onClick={undo}>Ångra</Button>
                  </div>
                )}
                {view.options.length > 0 && (
                  <CustomerOfferOptions options={view.options} formatAmount={shown}
                    renderImage={(item, className) => <SignedImage value={item.image_path} bucket="catalog-images" alt="" className={className} />}
                    renderAction={editable ? (o => {
                      const heading = customerSectionHeading(o);
                      return (
                        <Button type="button" variant="outline" className="mt-3 min-h-[44px]"
                          aria-label={`Lägg till ${heading} i offerten`} onClick={() => addOption(o.id, heading)}>
                          Lägg till i offerten
                        </Button>
                      );
                    }) : undefined} />
                )}
                {editable && view.options.length > 0 && (
                  <p className="text-[13px] text-muted-foreground">Knappen syns bara här. Kunden kan inte välja tillval på sin sida.</p>
                )}
              </section>
            )}
            <section aria-label="Pris och betalning">
              <div className="text-[11px] font-bold tracking-[.12em] uppercase text-gold-ink">Pris</div>
              <h2 className="font-display text-[22px] font-bold mt-1 mb-3">Pris och betalning</h2>
              <CustomerPriceRows rows={customerPriceRows(view.totals)} formatAmount={shown} />
              <div className="ml-auto w-full sm:max-w-[400px] mt-4">
                <div className="flex justify-between text-sm py-1"><span>{pay.incl_vat ? 'Ordersumma inkl. moms' : 'Ordersumma exkl. moms'}</span><Num>{fmtKr(pay.order_sum)}</Num></div>
                <div className="flex justify-between text-[13px] text-muted-foreground py-1"><span>{pay.incl_vat ? 'varav moms 25 %' : 'Omvänd byggmoms – köparen redovisar momsen'}</span>{pay.incl_vat && <Num>{fmtKr(pay.vat)}</Num>}</div>
                {pay.rot_active && (
                  <>
                    <div className="flex justify-between text-[13px] text-muted-foreground py-1"><span>ROT-berättigad arbetskostnad</span><Num>{fmtKr(pay.rot_base)}</Num></div>
                    <div className="flex justify-between text-sm font-bold text-success py-1"><span>Preliminärt ROT-avdrag {pay.rot_percent} %{pay.rot_capped ? ' (begränsat)' : ''}</span><Num>−{fmtKr(pay.rot_amount)}</Num></div>
                  </>
                )}
                <div className="flex items-center justify-between gap-3 bg-primary text-primary-foreground rounded-xl px-4 py-3.5 my-3">
                  <b className="text-[15px]">{pay.pay_label}</b>
                  <span className="font-display text-2xl font-bold text-gold tabular whitespace-nowrap">{fmtKr(pay.payable)}</span>
                </div>
                {pay.handpenning_percent > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between gap-3 text-sm"><span>Handpenning {pay.handpenning_percent} %</span><Num className="font-bold">{fmtKr(pay.handpenning)}</Num></div>
                    <div className="flex justify-between gap-3 text-sm"><span>Slutfaktura</span><Num className="font-bold">{fmtKr(pay.slutfaktura)}</Num></div>
                  </div>
                )}
              </div>
            </section>
            <div className="pb-2">
              <Button type="button" variant="outline" className="w-full sm:w-auto min-h-[44px]" onClick={() => onOpenChange(false)}>Tillbaka till offerten</Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
