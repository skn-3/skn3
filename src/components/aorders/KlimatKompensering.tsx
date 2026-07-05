import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TreePine, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';

interface Props {
  orderId: string;
  suggestedTreeCount: number;
}

interface CompensationRow {
  order_id: string;
  klimat_kompenserad_at: string;
  klimat_tree_count: number;
  klimat_verification_id: string;
}

export function KlimatKompensering({ orderId, suggestedTreeCount }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [trees, setTrees] = useState<number>(Math.max(1, Math.min(500, suggestedTreeCount || 1)));

  const { data: comp, isLoading } = useQuery({
    queryKey: ['order_climate_compensation', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_climate_compensation' as any)
        .select('order_id, klimat_kompenserad_at, klimat_tree_count, klimat_verification_id')
        .eq('order_id', orderId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as CompensationRow | null) ?? null;
    },
  });

  const compensate = useMutation({
    mutationFn: async () => {
      const n = Math.max(1, Math.min(500, Math.round(trees || 0)));
      const { data, error } = await supabase.functions.invoke('klimatkompensera', {
        body: { order_id: orderId, tree_count: n },
      });
      if (error) {
        // Handle FunctionsHttpError to surface backend message
        const anyErr = error as any;
        try {
          const ctx = anyErr?.context;
          if (ctx && typeof ctx.json === 'function') {
            const j = await ctx.json();
            if (j?.klimat_verification_id) return j;
            throw new Error(j?.error || error.message);
          }
        } catch (e) {
          if ((e as Error)?.message) throw e;
        }
        throw error;
      }
      return data;
    },
    onSuccess: (data: any) => {
      toast.success('Ordern är klimatkompenserad');
      qc.setQueryData(['order_climate_compensation', orderId], {
        order_id: orderId,
        klimat_kompenserad_at: data.klimat_kompenserad_at,
        klimat_tree_count: data.klimat_tree_count,
        klimat_verification_id: data.klimat_verification_id,
      });
      setOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Kunde inte klimatkompensera');
    },
  });

  if (isLoading) return null;

  if (comp) {
    const proofUrl = `https://smartklimat.org/v/${comp.klimat_verification_id}`;
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className="bg-green-600 hover:bg-green-600/90 text-white gap-1">
          <TreePine className="h-3 w-3" /> Klimatkompenserad · {comp.klimat_tree_count} träd
        </Badge>
        <a
          href={proofUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-green-700 hover:underline inline-flex items-center gap-1"
        >
          Visa bevis <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-green-600 hover:bg-green-600/90 text-white gap-2"
        size="sm"
      >
        <TreePine className="h-4 w-4" /> Klimatkompensera
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!compensate.isPending) setOpen(v); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TreePine className="h-5 w-5 text-green-600" /> Klimatkompensera ordern
            </DialogTitle>
            <DialogDescription>
              Ange antal träd som ska planteras via Smartklimat för denna order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tree-count">Antal träd</Label>
            <Input
              id="tree-count"
              type="number"
              min={1}
              max={500}
              value={trees}
              onChange={(e) => setTrees(Number(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">Tillåtet intervall: 1–500.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={compensate.isPending}>
              Avbryt
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-600/90 text-white gap-2"
              onClick={() => compensate.mutate()}
              disabled={compensate.isPending || trees < 1 || trees > 500}
            >
              {compensate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TreePine className="h-4 w-4" />}
              Bekräfta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
