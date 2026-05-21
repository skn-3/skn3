import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Copy, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MyCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
}

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'gzeovhwoouoxfenaxsss';

export function MyCalendarDialog({ open, onOpenChange, userName }: MyCalendarDialogProps) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await (supabase as any)
          .from('user_calendar_tokens')
          .select('token')
          .eq('user_name', userName)
          .maybeSingle();
        if (data?.token) {
          if (!cancelled) setToken(data.token);
        } else {
          const { data: ins, error } = await (supabase as any)
            .from('user_calendar_tokens')
            .insert({ user_name: userName })
            .select('token')
            .single();
          if (error) throw error;
          if (!cancelled) setToken(ins.token);
        }
      } catch (e) {
        toast.error('Kunde inte hämta kalender-token');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, userName]);

  const url = token ? `https://${PROJECT_ID}.supabase.co/functions/v1/calendar-ics?token=${token}` : '';

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Kopierat');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Kunde inte kopiera');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Prenumerera på din kalender</DialogTitle>
          <DialogDescription>
            Lägg till länken nedan i din kalender-app — uppdateras automatiskt när ärenden bokas eller ändras.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="flex gap-2">
              <Input value={url} readOnly className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button onClick={handleCopy} size="icon" variant="outline" aria-label="Kopiera URL">
                {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <p>📱 <strong className="text-foreground">Apple Kalender:</strong> Arkiv → Ny kalenderprenumeration → klistra in URL</p>
              <p>🌐 <strong className="text-foreground">Google Calendar:</strong> Andra kalendrar → + → Från URL → klistra in</p>
              <p>💼 <strong className="text-foreground">Outlook:</strong> Lägg till kalender → Prenumerera från webb → klistra in</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
