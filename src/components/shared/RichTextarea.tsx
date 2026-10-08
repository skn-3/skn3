import { useRef, type KeyboardEvent } from 'react';
import { Bold } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { RichText } from '@/components/shared/RichText';
import { hasRichMarkup, toggleRichMarker } from '@/lib/richText';

type Props = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Textarea med knappar för fet (**) och röd (==) märkning, plus förhandsvisning.
 * Markera text och klicka på en knapp (eller Ctrl/Cmd+B för fet). Samma knapp igen tar bort märkningen.
 */
export function RichTextarea({ value, onChange, rows = 3, placeholder, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function apply(marker: '**' | '==') {
    const el = ref.current;
    if (!el || disabled) return;
    const { text, selectionStart, selectionEnd } = toggleRichMarker(value, el.selectionStart, el.selectionEnd, marker);
    onChange(text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      apply('**');
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2"
          onClick={() => apply('**')}
          disabled={disabled}
          title="Fet (Ctrl/Cmd+B)"
          aria-label="Fet text"
        >
          <Bold className="h-3.5 w-3.5 mr-1" />
          Fet
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-destructive hover:text-destructive"
          onClick={() => apply('==')}
          disabled={disabled}
          title="Röd text för extra viktig information"
          aria-label="Röd text"
        >
          <span className="mr-1 font-bold">A</span>
          Röd
        </Button>
        <span className="text-xs text-muted-foreground ml-1">Markera text och klicka. Syns i PDF och mejl till montör.</span>
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
      />
      {hasRichMarkup(value) && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Förhandsvisning</div>
          <RichText text={value} />
        </div>
      )}
    </div>
  );
}