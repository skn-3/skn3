import { QRCodeSVG } from 'qrcode.react';
import { TreePine, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claimUrl: string | null | undefined;
  treeTotal?: number | null;
}

export function KlimatQrDialog({ open, onOpenChange, claimUrl, treeTotal }: Props) {
  if (!claimUrl) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(claimUrl);
      toast.success('Länk kopierad');
    } catch {
      toast.error('Kunde inte kopiera länken');
    }
  };

  const trees = treeTotal ?? 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TreePine className="h-5 w-5 text-green-600 dark:text-green-400" />
            {trees > 1 ? 'Vi har planterat träd för dig' : 'Vi har planterat ett träd för dig'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <p className="text-sm text-muted-foreground text-center">
            Scanna för att hämta ditt personliga värdebevis
          </p>
          <div className="rounded-xl bg-white p-4 shadow-sm" data-testid="klimat-qr">
            <QRCodeSVG value={claimUrl} size={220} includeMargin={false} />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-green-300 dark:border-green-800 bg-green-100 dark:bg-green-900/40 px-3 py-1 text-sm font-medium text-green-800 dark:text-green-300">
            <TreePine className="h-4 w-4" /> {trees} {trees === 1 ? 'träd' : 'träd'} planterade
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={copy}><Copy className="h-4 w-4 mr-1" /> Kopiera länk</Button>
          <Button onClick={() => onOpenChange(false)}>Stäng</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
