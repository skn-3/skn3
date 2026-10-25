import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ListSearchToggle({ open, onToggle, active = false }: { open: boolean; onToggle: () => void; active?: boolean }) {
  return <Button variant={open || active ? 'secondary' : 'outline'} size="icon" className="h-11 w-11 shrink-0 rounded-full border-border" aria-label={open ? 'Dölj sökning' : 'Visa sökning'} aria-expanded={open} onClick={onToggle}><Search /></Button>;
}
export function ListSearchField({ value, onChange, placeholder, inputRef }: { value: string; onChange: (value: string) => void; placeholder: string; inputRef?: React.Ref<HTMLInputElement> }) {
  return <div className="relative animate-fade-up motion-reduce:animate-none">
    <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
    <Input ref={inputRef} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-11 bg-background pl-10 pr-12" />
    {value && <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-11 w-11" aria-label="Rensa sökning" onClick={() => onChange('')}><X /></Button>}
  </div>;
}