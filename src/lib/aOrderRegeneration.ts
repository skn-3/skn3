import { supabase } from '@/integrations/supabase/client';
import { buildAOrderPdf, loadAOrderLogo } from './aOrderPdf';
import { datePart, invoicePdfName, creditPdfName } from './pdfNames';

/** Replaces only the stored PDF; invoice dates, numbering and statuses remain untouched. */
export async function regenerateAOrderPdf(order: any, sendEmail: boolean): Promise<string> {
  const isCredit = order.status === 'credited' && !!order.credited_from_order_id;
  if (order.status !== 'invoiced' && !isCredit) throw new Error('Ordern är inte fakturerad');
  const recipient = order.montor_teams?.invoice_email || order.montor_teams?.email || '';
  if (sendEmail && !recipient) throw new Error('Montörsteamet saknar faktura-e-post');
  const doc = buildAOrderPdf({
    variant: isCredit ? 'credit' : 'invoice',
    date: datePart(order.invoice_sent_at) || order.date,
    orderNumber: order.invoice_number,
    customerAddress: order.customer_address || '',
    customerName: order.customer_name,
    lines: order.line_items || [],
    description: order.description,
    subNote: isCredit ? order.description : undefined,
    team: order.montor_teams,
    aOrderNumber: order.order_number,
    aOrderDate: order.date,
    logoDataUrl: await loadAOrderLogo(),
  });
  const { data, error } = await supabase.functions.invoke('send-a-order-invoice', {
    body: {
      a_order_id: order.id,
      pdf_base64: doc.output('datauristring').split(',')[1] || '',
      kind: isCredit ? 'credit' : 'invoice',
      invoice_number: order.invoice_number,
      storage_subpath: isCredit ? 'kredit' : 'faktura',
      sub_note: isCredit ? order.description : undefined,
      file_name: isCredit ? creditPdfName(order) : invoicePdfName(order),
      skip_email: !sendEmail,
    },
  });
  if (error) {
    const response = error.context;
    if (response instanceof Response) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || error.message);
    }
    throw error;
  }
  if (data?.error || !data?.pdf_path) throw new Error(data?.error || 'PDF:en kunde inte sparas');
  const { error: updateError } = await supabase.from('a_orders').update({ pdf_path: data.pdf_path }).eq('id', order.id);
  if (updateError) throw updateError;
  return recipient;
}