// Kundvyns avsnitt: rubrik och belopp, text, uppgifter och val med provbit. Bara presentation; beloppen
// formateras av den som anropar (samma prisvisning som offertraderna). Används av kundsidan och förhandsvisningen.
import type { ReactNode } from 'react';
import { Package } from 'lucide-react';
import { swatchStyle } from '@/lib/swatchStyle';
import type { CustomerCommonLine, CustomerItem, CustomerSection } from '@/lib/kalkyl';

export type CustomerTile = Omit<CustomerItem, 'image_path'> & { image_path?: string | null; image_url?: string | null };
export interface CustomerSectionsData {
  intro: string | null;
  sections: (Omit<CustomerSection, 'items'> & { items: CustomerTile[] })[];
  common: CustomerCommonLine[];
}

const Num = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span className={`font-mono tabular whitespace-nowrap ${className}`}>{children}</span>
);

/** "NCS S 0502-Y" eller "RAL 9010". */
export const colorCodeText = (c: CustomerTile['color']) => {
  if (!c?.code) return '';
  if (!c.system || c.code.toUpperCase().startsWith(c.system.toUpperCase())) return c.code;
  return `${c.system} ${c.code}`;
};

function TileSwatch({ item, renderImage }: { item: CustomerTile; renderImage?: (item: CustomerTile, className: string) => ReactNode }) {
  const cls = 'h-10 w-10 shrink-0 rounded-lg border border-border overflow-hidden';
  if (item.image_url) return <img src={item.image_url} alt="" loading="lazy" className={`${cls} object-cover`} />;
  if (item.image_path && renderImage) return <>{renderImage(item, `${cls} object-cover`)}</>;
  const style = item.color?.hex ? { backgroundColor: item.color.hex } : swatchStyle({ swatch: item.swatch });
  if (style) return <span className={cls} style={style} aria-hidden="true" />;
  return <span className={`${cls} flex items-center justify-center bg-muted text-muted-foreground`} aria-hidden="true"><Package className="h-4 w-4" /></span>;
}

function Tile({ item, renderImage }: { item: CustomerTile; renderImage?: (item: CustomerTile, className: string) => ReactNode }) {
  const code = colorCodeText(item.color);
  const colorName = item.color?.name && item.color.name !== item.name ? item.color.name : null;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 min-w-0">
      <TileSwatch item={item} renderImage={renderImage} />
      <div className="min-w-0">
        <div className="text-[11.5px] leading-tight text-muted-foreground">{item.label}</div>
        <div className="text-[14px] font-semibold leading-snug">{item.name}</div>
        {(item.detail || code || colorName) && (
          <div className="text-[12.5px] leading-snug text-muted-foreground">
            {[item.detail, colorName].filter(Boolean).join(' · ')}
            {code && <>{item.detail || colorName ? ' · ' : ''}<span className="font-mono whitespace-nowrap">{code}</span></>}
          </div>
        )}
      </div>
    </li>
  );
}

type SectionData = CustomerSectionsData['sections'][number];
type RenderImage = (item: CustomerTile, className: string) => ReactNode;

/** Ett avsnitt: rubrik och pris på samma rad, text, uppgifter och val med provbit. Delas av det som ingår och tillvalen. */
function SectionArticle({ s, amountText, renderImage, action }: { s: SectionData; amountText: string; renderImage?: RenderImage; action?: ReactNode }) {
  return (
    <article className="py-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-[17px] font-bold leading-snug min-w-0">{s.room ? `${s.room} · ${s.title}` : s.title}</h3>
        <Num className="text-[15px]">{amountText}</Num>
      </div>
      {s.text && <p className="text-[14.5px] leading-relaxed text-muted-foreground mt-1.5">{s.text}</p>}
      {s.facts.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mt-2.5" aria-label="Uppgifter">
          {s.facts.map((f, i) => (
            <li key={i} className="inline-flex h-7 items-center rounded-full border border-border bg-background px-2.5 text-[12.5px] font-semibold">{f}</li>
          ))}
        </ul>
      )}
      {s.items.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3" aria-label="Val">
          {s.items.map((it, i) => <Tile key={i} item={it} renderImage={renderImage} />)}
        </ul>
      )}
      {action}
    </article>
  );
}

export function CustomerOfferSections({ view, formatAmount, renderImage }: {
  view: CustomerSectionsData;
  /** Belopp ex moms → visad text, t.ex. inkl. moms. */
  formatAmount: (exVat: number) => string;
  /** Bild från sökväg (förhandsvisningen signerar själv); kundsidan får färdiga image_url. */
  renderImage?: RenderImage;
}) {
  return (
    <div>
      {view.intro && <p className="text-[15px] leading-relaxed mb-4 whitespace-pre-line">{view.intro}</p>}
      <div className="border-t border-border divide-y divide-border">
        {view.sections.map(s => <SectionArticle key={s.id} s={s} amountText={formatAmount(s.amount_ex_vat)} renderImage={renderImage} />)}
        {view.common.length > 0 && (
          <div className="py-2">
            {view.common.map((c, i) => (
              <div key={i} className="flex items-baseline justify-between gap-4 py-2 text-[14.5px]">
                <span className="min-w-0">{c.title}</span>
                <Num>{formatAmount(c.amount_ex_vat)}</Num>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Innehållet i kortet "Tillval": rubriker, förklaring och ett avsnitt per tillval med plustecken före priset.
 * Kunden kan aldrig välja tillval. Visas bara när det finns tillval (den som anropar avgör).
 * renderAction skickas bara in av förhandsvisningen i kalkylen (säljarens knapp); utan den renderas kortet som på kundsidan.
 */
export function CustomerOfferOptions({ options, formatAmount, renderImage, renderAction }: {
  options: SectionData[];
  formatAmount: (exVat: number) => string;
  renderImage?: RenderImage;
  /** Säljarens åtgärd per tillval, bara i förhandsvisningen. Kundsidan skickar aldrig in den. */
  renderAction?: (option: SectionData) => ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] font-bold tracking-[.12em] uppercase text-gold-ink">Tillval</div>
      <h2 className="font-display text-[22px] font-bold mt-1 mb-2">Lägg till om du vill</h2>
      <p className="text-[14.5px] leading-relaxed text-muted-foreground mb-3">Tillvalen ingår inte i priset. Hör av dig till din kontakt om du vill lägga till något.</p>
      <div className="border-t border-border divide-y divide-border">
        {options.map(s => <SectionArticle key={s.id} s={s} amountText={`+ ${formatAmount(s.amount_ex_vat)}`} renderImage={renderImage} action={renderAction?.(s)} />)}
      </div>
    </div>
  );
}

/** Prisraderna Arbete, Material och Övrigt (redan filtrerade på belopp). */
export function CustomerPriceRows({ rows, formatAmount }: { rows: { label: string; amount_ex_vat: number }[]; formatAmount: (exVat: number) => string }) {
  return (
    <div className="border-t border-border">
      {rows.map(r => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-3 border-b border-border">
          <div className="font-semibold text-[15px]">{r.label}</div>
          <Num className="text-[15px]">{formatAmount(r.amount_ex_vat)}</Num>
        </div>
      ))}
    </div>
  );
}
