// Sökbar väljare för "Avser faktura" i Registrera avdrag. Samma mönster som CaseCombobox
// (tryckvänliga rader, ordvis sökning). Urval och visning kommer från relatedInvoiceOptions.
import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { matchesSearch } from '@/lib/caseMatching';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import type { RelatedInvoiceOption } from '@/lib/montorSettlement';

interface Props {
  id?: string;
  options: RelatedInvoiceOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function RelatedInvoiceCombobox({ id, options, value, onChange, disabled, placeholder = 'Ingen faktura vald' }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value);
  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="min-h-11 w-full min-w-0 justify-between font-normal">
            <span className="truncate">{selected ? selected.label : placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0">
          <Command filter={(v, search) => {
            const o = options.find(x => x.id === v);
            return o && matchesSearch([o.invoice_number, o.address], search) ? 1 : 0;
          }}>
            <CommandInput placeholder="Sök fakturanummer eller adress..." autoFocus />
            <CommandList className="max-h-[300px]">
              <CommandEmpty>Ingen faktura hittades</CommandEmpty>
              {options.map(o => (
                <CommandItem key={o.id} value={o.id} className="min-h-11" onSelect={v => { onChange(v === value ? '' : v); setOpen(false); }}>
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', value === o.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 break-words">{o.label}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && (
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Ta bort fakturakopplingen" onClick={() => onChange('')}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
