import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Konsulten kopplad till inloggningen (RLS släpper bara igenom den egna raden; admin filtreras på user_id). */
export function useMyConsultant() {
  const [consultant, setConsultant] = useState<{ id: string; name: string; company_name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) { if (!cancelled) setLoading(false); return; }
      const { data } = await supabase.from('consultants').select('id, name, company_name').eq('user_id', uid).maybeSingle();
      if (!cancelled) { setConsultant(data ?? null); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  return { consultant, loading };
}
