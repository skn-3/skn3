import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  customer_name?: string | null;
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
          className="w-full justify-between font-normal"
        >
          {selected ? selected.address : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command
          filter={(value, search) => {
            const term = search.toLowerCase();
            const c = cases.find(x => x.id === value);
            if (!c) return 0;
            const haystack = [c.address, c.customer_name || ''].join(' ').toLowerCase();
            return haystack.includes(term) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Sök adress..." autoFocus />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>Inget ärende hittades</CommandEmpty>
            {cases.map(c => (
              <CommandItem
                key={c.id}
                value={c.id}
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
                  <span>{c.address}</span>
                  {c.customer_name && (
                    <span className="text-xs text-muted-foreground">{c.customer_name}</span>
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
