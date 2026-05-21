import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCases, fetchVisits, type CaseRow } from '@/lib/supabaseClient';
import { SELLER_PIPELINE_COLUMNS, STATUS_LABELS, SELLERS } from '@/lib/constants';
import { CaseCard } from './CaseCard';
import { FollowUpSection } from './FollowUpSection';
import { Loader2, Search, X, SlidersHorizontal } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';


interface PipelineProps {
  sellerName: string;
  isAdmin?: boolean;
  onSelectCase: (c: CaseRow) => void;
}

function matchesSearch(c: CaseRow, term: string): boolean {
  if (!term) return true;
  const t = term.toLowerCase();
  const fields = [
    c.address,
    c.customer_name,
    c.customer_phone,
    c.offer_number,
    (c as any).city,
    c.notes,
  ];
  return fields.some(f => f && String(f).toLowerCase().includes(t));
}

export function Pipeline({ sellerName, isAdmin, onSelectCase }: PipelineProps) {
  const [adminFilter, setAdminFilter] = useState<string>('alla');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchTerm), 200);
    return () => clearTimeout(id);
  }, [searchTerm]);

  // Keyboard shortcut "/"
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearchTerm('');
        setDebouncedSearch('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const queryFilter = isAdmin ? {} : { seller: sellerName };

  const { data: cases, isLoading } = useQuery({
    queryKey: ['cases', isAdmin ? 'admin' : sellerName],
    queryFn: () => fetchCases(queryFilter),
  });

  const { data: visits } = useQuery({
    queryKey: ['visits', isAdmin ? 'admin' : sellerName],
    queryFn: () => fetchVisits(isAdmin ? {} : { seller: sellerName }),
  });

  const filteredCases = useMemo(() => (cases || []).filter(c => {
    if (!isAdmin) return true;
    if (adminFilter === 'alla') return true;
    return c.seller === adminFilter;
  }), [cases, isAdmin, adminFilter]);

  const searchedCases = useMemo(() => {
    if (!debouncedSearch) return filteredCases;
    return filteredCases.filter(c => matchesSearch(c, debouncedSearch));
  }, [filteredCases, debouncedSearch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const followUps = (visits || []).filter((v) => v.result === 'aterkoppla' && !v.case_id);

  const showSellerBadge = !!isAdmin && adminFilter === 'alla';

  const grouped = SELLER_PIPELINE_COLUMNS.reduce((acc, status) => {
    acc[status] = searchedCases.filter((c) => {
      if (status === 'godkand') return c.status === 'godkand' || c.status === 'i_produktion';
      return c.status === status;
    });
    return acc;
  }, {} as Record<string, CaseRow[]>);

  const totalVisible = searchedCases.length;
  const totalCases = filteredCases.length;

  const columnLabels: Record<string, string> = {
    ...STATUS_LABELS,
    godkand: 'Godkänd / I produktion',
  };

  return (
    <div className="space-y-4">
      {/* Search + filter row */}
      <div className="px-3 md:px-0 space-y-1">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Sök ärenden..."
              className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              autoFocus
            />
            {searchTerm && (
              <button
                onClick={() => { setSearchTerm(''); setDebouncedSearch(''); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Rensa sökning"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {isAdmin && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1.5">
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline truncate max-w-[120px]">
                    {adminFilter === 'alla' ? 'Alla säljare' : adminFilter}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56">
                <Label className="text-xs">Visa säljare</Label>
                <Select value={adminFilter} onValueChange={setAdminFilter}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alla">Alla</SelectItem>
                    {SELLERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </PopoverContent>
            </Popover>
          )}
        </div>
        {debouncedSearch && (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <span>Visar {totalVisible} ärenden av {totalCases}</span>
            <button onClick={() => { setSearchTerm(''); setDebouncedSearch(''); }} className="text-primary hover:underline">
              Rensa
            </button>
          </p>
        )}
      </div>

      {followUps.length > 0 && (
        <FollowUpSection visits={followUps} sellerName={sellerName} />
      )}

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max px-3 md:px-0">

          {SELLER_PIPELINE_COLUMNS.map((status) => (
            <div key={status} className="w-56 shrink-0">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {columnLabels[status] || STATUS_LABELS[status]}
                </h2>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
                  {grouped[status]?.length || 0}
                </span>
              </div>
              <div className="space-y-2">
                {grouped[status]?.map((c) => (
                  <CaseCard key={c.id} caseData={c} onClick={() => onSelectCase(c)} showSeller={showSellerBadge} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
