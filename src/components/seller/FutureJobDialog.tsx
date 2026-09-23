import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronsUpDown, X } from 'lucide-react';
import type { CaseRow } from '@/lib/supabaseClient';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseData?: CaseRow | null;
  currentUser: string;
}

interface CaseOption {
  id: string;
  address: string;
  customer_name: string | null;
  customer_phone: string | null;
  seller: string | null;
  order_number: string | null;
}

export function FutureJobDialog({ open, onOpenChange, caseData, currentUser }: Props) {
  const queryClient = useQueryClient();
  const locked = !!caseData;

  const [description, setDescription] = useState('');
  const [contactDate, setContactDate] = useState('');
  const [pickedCase, setPickedCase] = useState<CaseOption | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setContactDate('');
    setPickedCase(null);
    setCustomerName('');
    setAddress('');
    setPhone('');
  }, [open]);

  const { data: cases } = useQuery({
    queryKey: ['future_job_case_options'],
    enabled: open && !locked,
    queryFn: async (): Promise<CaseOption[]> => {
      const { data, error } = await supabase
        .from('cases')
        .select('id, address, customer_name, customer_phone, seller, order_number')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as CaseOption[];
    },
  });

  const target = useMemo(() => {
    if (caseData) {
      return {
        case_id: caseData.id,
        customer_name: caseData.customer_name,
        address: caseData.address || null,
        phone: caseData.customer_phone || null,
        seller: caseData.seller || currentUser,
      };
    }
    if (pickedCase) {
      return {
        case_id: pickedCase.id,
        customer_name: pickedCase.customer_name || '',
        address: pickedCase.address || null,
        phone: pickedCase.customer_phone || null,
        seller: pickedCase.seller || currentUser,
      };
    }
    return {
      case_id: null,
      customer_name: customerName.trim(),
      address: address.trim() || null,
      phone: phone.trim() || null,
      seller: currentUser,
    };
  }, [caseData, pickedCase, customerName, address, phone, currentUser]);

  const canSave = description.trim() !== '' && contactDate !== '' && target.customer_name !== '';

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('future_jobs').insert({
        case_id: target.case_id,
        customer_name: target.customer_name,
        address: target.address,
        phone: target.phone,
        seller: target.seller,
        description: description.trim(),
        contact_date: contactDate,
        created_by: currentUser,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['future_jobs'] });
      queryClient.invalidateQueries({ queryKey: ['case_future_jobs'] });
      toast.success('Återkontakt sparad');
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ny återkontakt</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {locked ? (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="font-medium">{caseData!.customer_name}</div>
              <div className="text-muted-foreground">{caseData!.address}</div>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Koppla till ärende (valfritt)</Label>
                {pickedCase ? (
                  <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-2 text-sm">
                    <div>
                      <div className="font-medium">{pickedCase.customer_name || 'Utan namn'}</div>
                      <div className="text-muted-foreground text-xs">{pickedCase.address}</div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPickedCase(null)} aria-label="Ta bort ärendekoppling">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        Sök ärende (adress, kund, ordernr)
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command
                        filter={(value, search) => {
                          const term = search.toLowerCase();
                          const c = (cases || []).find(x => x.id === value);
                          if (!c) return 0;
                          const hay = [c.address, c.customer_name || '', c.order_number || ''].join(' ').toLowerCase();
                          return hay.includes(term) ? 1 : 0;
                        }}
                      >
                        <CommandInput placeholder="Sök adress, kund eller ordernr..." autoFocus />
                        <CommandList className="max-h-[260px]">
                          <CommandEmpty>Inget ärende hittades</CommandEmpty>
                          {(cases || []).map(c => (
                            <CommandItem
                              key={c.id}
                              value={c.id}
                              onSelect={() => {
                                setPickedCase(c);
                                setPickerOpen(false);
                              }}
                            >
                              <div className="flex flex-col">
                                <span>{c.address}</span>
                                <span className="text-xs text-muted-foreground">
                                  {c.customer_name}{c.order_number ? ` · ${c.order_number}` : ''}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {!pickedCase && (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Kund utan ärende</p>
                  <div className="space-y-1">
                    <Label className="text-xs">Kundnamn *</Label>
                    <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Adress</Label>
                      <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Telefon</Label>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Vad vill kunden utföra? *</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">När ska kunden kontaktas? *</Label>
            <Input type="date" value={contactDate} onChange={(e) => setContactDate(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Avbryt</Button>
            <Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Sparar...' : 'Spara'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
