import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { matchesSearch } from '@/lib/caseMatching';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

interface CaseItem {
  id: string;
  address: string;
  city?: string | null;
  customer_name?: string | null;
  /** Visas som liten grå text efter adressen när den finns. */
  statusLabel?: string | null;
}

interface Props {
  cases: CaseItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

export function CaseCombobox({ cases, value, onChange, placeholder = 'Välj ärende...' }: Props) {
  const [open, setOpen] = useState(false);

  const selected = cases.find(c => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full min-h-11 justify-between font-normal"
        >
          <span className="truncate">{selected ? selected.address : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command
          filter={(value, search) => {
            const c = cases.find(x => x.id === value);
            if (!c) return 0;
            // Ordvis sökning: "sopran 6" och "6 vällingby" hittar "Soprangränd 6, Vällingby".
            return matchesSearch([c.address, c.city, c.customer_name], search) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Sök adress, ort eller kund..." autoFocus />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>Inget ärende hittades</CommandEmpty>
            {cases.map(c => (
              <CommandItem
                key={c.id}
                value={c.id}
                className="min-h-11"
                onSelect={(currentValue) => {
                  onChange(currentValue === value ? '' : currentValue);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === c.id ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <div className="flex flex-col">
                  <span>{c.address}{c.statusLabel && <span className="ml-2 text-xs text-muted-foreground">{c.statusLabel}</span>}</span>
                  {(c.customer_name || c.city) && (
                    <span className="text-xs text-muted-foreground">{[c.customer_name, c.city].filter(Boolean).join(' · ')}</span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
