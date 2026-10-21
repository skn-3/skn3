// Edge function: consultant-drive
// Admin-only. Läser konsultens Löner-mapp i Drive (månader, skanning),
// tolkar provisions- och kvitto-PDF:er med AI och lägger rader i loggarket.
// Systemet ändrar, flyttar eller raderar aldrig något i Drive eller Sheets.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { DriveReader, type DriveReadFile } from '../_shared/googleDriveRead.ts';
import { SheetsClient, LOG_HEADER } from '../_shared/googleSheets.ts';
import { normalizeDocNumber, parseMonthFolderName, previewEstimate } from '../_shared/consultantPay.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function callAi(systemPrompt: string, userText: string, dataUrl: string) {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY saknas');
  const res = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: dataUrl } }] },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('AI är överbelastad just nu. Försök igen om en stund.');
    if (res.status === 402) throw new Error('AI-krediter slut. Fyll på krediter i workspace.');
    throw new Error(`AI-fel (${res.status})`);
  }
  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Tom AI-respons');
  const cleaned = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  return JSON.parse(cleaned);
}

const PROVISION_PROMPT = `Dokumentet är Mockfjärds "Provision Löneunderlag Säljare" (svenska).
Returnera ENBART ett JSON-objekt — ingen text, ingen markdown, inga kodblock — med EXAKT denna struktur:
{ "payout_date": "YYYY-MM-DD", "period_start": "YYYY-MM-DD", "period_end": "YYYY-MM-DD", "seller_name": string|null,
  "rows": [ { "order_number": string, "customer_name": string, "order_date": "YYYY-MM-DD"|null, "signing_date": "YYYY-MM-DD"|null, "amount": number } ],
  "corrections": [ { "order_number": string|null, "customer_name": string|null, "text": string, "amount": number } ],
  "sum_rows": number, "sum_corrections": number, "sum_total": number }
Regler:
- "Utbetalning 2026-04-07" = payout_date. "Utbetalningsperiod 2026-03-01 - 2026-03-31" = period_start/period_end.
- Tabellens kolumn "Utb.ÅF" = amount. "Summa Utb.ÅF" = sum_rows.
- Raderna under "Korrigering" med negativa belopp = corrections. "Summa Korrigering" = sum_corrections.
- "Summa Total" = sum_total.
- Belopp som tal utan mellanslag, "- 1 750" = -1750. Använd punkt som decimaltecken.`;

const DEDUCTION_PROMPT = `Dokumentet är ett svenskt kvitto eller krav (p-böter, trängselskatt, Tesla-laddning, färjeavgift, fordonsskatt, inkasso m.m.) som ska dras från en konsults provision.
Returnera ENBART ett JSON-objekt — ingen text, ingen markdown, inga kodblock — med EXAKT denna struktur:
{ "doc_type": "p_bot|kontrollavgift|trangselskatt|tesla_laddning|farja|fordonsskatt|inkasso|annat",
  "issuer": string|null, "doc_date": "YYYY-MM-DD"|null, "reg_nr": string|null,
  "doc_number": string|null, "original_amount": number|null, "fee_amount": number|null, "amount_total": number,
  "description": string, "is_reminder": boolean, "is_owner_cost_candidate": boolean }
Regler:
- doc_number = OCR-nummer, ärendenummer, debiteringsnummer eller fakturanummer — det som identifierar just detta krav.
- amount_total = det belopp som faktiskt ska betalas inkl. påminnelse-/inkassoavgift. Tal, punkt som decimaltecken.
- fordonsskatt, besiktning och försäkring → is_owner_cost_candidate true.
- description kort, t.ex. "Kontrollavgift Opalgatan Göteborg 2026-08-12".
- Påminnelse eller inkassokrav → is_reminder true, fee_amount = avgiftens belopp.`;

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));


async function scanFolder(drive: DriveReader, folderId: string) {
  const folder = await drive.getFile(folderId);
  const children = await drive.listChildren(folderId);
  const isFolder = (f: DriveReadFile) => f.mimeType === 'application/vnd.google-apps.folder';
  const provisionCandidates = children.filter(f => !isFolder(f) && /provision|l[öo]neunderlag/i.test(f.name));
  let provisionFile: DriveReadFile | null = null;
  if (provisionCandidates.length) {
    const noCopy = provisionCandidates.filter(f => !/kopia/i.test(f.name));
    const pool = noCopy.length ? noCopy : provisionCandidates;
    provisionFile = pool.sort((a, b) => String(b.modifiedTime ?? '').localeCompare(String(a.modifiedTime ?? '')))[0];
  }
  const deductionFiles: any[] = [];
  for (const sub of children.filter(isFolder)) {
    const subFiles = await drive.listChildren(sub.id);
    for (const f of subFiles.filter(f2 => !isFolder(f2))) {
      deductionFiles.push({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, webViewLink: f.webViewLink, subfolder: sub.name });
    }
  }
  const usedIds = new Set([provisionFile?.id, ...deductionFiles.map((d: any) => d.id)]);
  const otherFiles = children.filter(f => !isFolder(f) && !usedIds.has(f.id)).map(f => ({ name: f.name, webViewLink: f.webViewLink }));
  return {
    folder: { id: folder.id, name: folder.name, createdTime: folder.createdTime },
    payout_month: parseMonthFolderName(folder.name),
    provision_file: provisionFile ? { id: provisionFile.id, name: provisionFile.name, modifiedTime: provisionFile.modifiedTime, webViewLink: provisionFile.webViewLink } : null,
    deduction_files: deductionFiles,
    other_files: otherFiles,
  };
}

async function parseProvision(drive: DriveReader, fileId: string) {
  const file = await drive.getFile(fileId);
  const bytes = await drive.download(fileId);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  const dataUrl = `data:${file.mimeType || 'application/pdf'};base64,${btoa(binary)}`;
  const parsed = await callAi(PROVISION_PROMPT, 'Tolka löneunderlaget och returnera JSON enligt schemat.', dataUrl);
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const corrections = Array.isArray(parsed.corrections) ? parsed.corrections : [];
  const sumRows = num(parsed.sum_rows) ?? 0;
  const sumCorrections = num(parsed.sum_corrections) ?? 0;
  const sumTotal = num(parsed.sum_total) ?? 0;
  const rowsSum = rows.reduce((s: number, r: any) => s + (Number(r?.amount) || 0), 0);
  const problems: string[] = [];
  if (Math.abs(rowsSum - sumRows) > 3) problems.push(`Radsumman ${rowsSum} stämmer inte med "Summa Utb.ÅF" ${sumRows}`);
  if (Math.abs(sumRows + sumCorrections - sumTotal) > 3) problems.push(`"Summa Utb.ÅF" + "Summa Korrigering" (${sumRows + sumCorrections}) stämmer inte med "Summa Total" ${sumTotal}`);
  return {
    payout_date: parsed.payout_date ?? null,
    period_start: parsed.period_start ?? null,
    period_end: parsed.period_end ?? null,
    seller_name: parsed.seller_name ?? null,
    rows,
    corrections,
    sum_rows: sumRows,
    sum_corrections: sumCorrections,
    sum_total: sumTotal,
    needs_review: problems.length > 0,
    note: problems.join('. ') || null,
    file: { id: file.id, name: file.name, modifiedTime: file.modifiedTime, webViewLink: file.webViewLink },
  };
}

const isoDate = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

async function runPreview(db: ReturnType<typeof admin>, consultant: any, force: boolean) {
  const { data: saved } = await db.from('consultant_previews').select('*').eq('consultant_id', consultant.id).maybeSingle();
  const base: Record<string, unknown> = {
    consultant_id: consultant.id, folder_id: null, folder_name: null, folder_created_time: null, payout_month: null,
    provision_file_id: null, provision_file_name: null, provision_modified_time: null, provision_payout_date: null,
    period_start: null, period_end: null, tb_amount: null, tb_needs_review: false, tb_note: null, tier_pct: null,
    commission_gross: null, standard_deductions: 0, deduction_file_count: 0, net_estimate: null, vat_estimate: null,
    total_estimate: null, existing_payout_id: null, state: 'ready', error: null, computed_at: new Date().toISOString(),
  };
  const save = async (row: Record<string, unknown>) => {
    const { data, error } = await db.from('consultant_previews').upsert(row, { onConflict: 'consultant_id' }).select('*').single();
    if (error) throw new Error(error.message);
    return data;
  };
  if (!consultant.drive_folder_id) return save({ ...base, state: 'no_folder', error: 'Konsulten saknar Löner-mapp' });
  try {
    const drive = new DriveReader();
    const folders = await drive.listChildren(consultant.drive_folder_id, { foldersOnly: true });
    const newest = folders.sort((a, b) => String(b.createdTime ?? '').localeCompare(String(a.createdTime ?? '')))[0];
    if (!newest) return save({ ...base, state: 'no_folder' });
    const payoutMonth = parseMonthFolderName(newest.name);
    Object.assign(base, { folder_id: newest.id, folder_name: newest.name, folder_created_time: newest.createdTime ?? null, payout_month: payoutMonth });
    const { data: payouts } = await db.from('consultant_payouts').select('id, status, kind, payout_month, drive_month_folder_id').eq('consultant_id', consultant.id).eq('kind', 'payout').neq('status', 'draft');
    const existing = (payouts ?? []).find(p => p.drive_month_folder_id === newest.id || (payoutMonth && p.payout_month === payoutMonth));
    if (existing) return save({ ...base, state: 'already_invoiced', existing_payout_id: existing.id });
    const scan = await scanFolder(drive, newest.id);
    base.deduction_file_count = scan.deduction_files.length;
    if (!scan.provision_file) return save({ ...base, state: 'no_provision' });
    Object.assign(base, { provision_file_id: scan.provision_file.id, provision_file_name: scan.provision_file.name, provision_modified_time: scan.provision_file.modifiedTime ?? null });
    let tb: number; let parsedFields: Record<string, unknown>;
    const reuse = !force && saved && saved.provision_file_id === scan.provision_file.id
      && (saved.provision_modified_time ?? null) === (scan.provision_file.modifiedTime ?? null) && saved.tb_amount != null;
    if (reuse) {
      tb = Number(saved.tb_amount);
      parsedFields = { provision_payout_date: saved.provision_payout_date, period_start: saved.period_start, period_end: saved.period_end, tb_needs_review: saved.tb_needs_review, tb_note: saved.tb_note, computed_at: saved.computed_at };
    } else {
      try {
        const prov = await parseProvision(drive, scan.provision_file.id);
        tb = Number(prov.sum_total) || 0;
        parsedFields = { provision_payout_date: isoDate(prov.payout_date), period_start: isoDate(prov.period_start), period_end: isoDate(prov.period_end), tb_needs_review: prov.needs_review, tb_note: prov.note };
      } catch (e) {
        return save({ ...base, state: 'error', error: `Tolkningen misslyckades: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
    const est = previewEstimate(consultant, tb);
    return save({ ...base, ...parsedFields, tb_amount: tb, tier_pct: est.pct, commission_gross: est.gross, standard_deductions: est.standardDeductions, net_estimate: est.net, vat_estimate: est.vat, total_estimate: est.total, state: 'ready' });
  } catch (e) {
    return save({ ...base, state: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = await requireAuth(req, corsHeaders);
    if (auth.response) return auth.response;

    const body = await req.json();
    const action = body?.action;
    const db = admin();

    if (action === 'preview') {
      if (!body?.consultant_id) return json({ error: 'consultant_id saknas' }, 400);
      const { data: c } = await db.from('consultants').select('*').eq('id', body.consultant_id).maybeSingle();
      if (!c) return json({ error: 'Konsulten hittades inte' }, 404);
      if (!auth.isAdmin && c.user_id !== auth.userId) return json({ error: 'Forbidden' }, 403);
      return json({ preview: await runPreview(db, c, body.force === true) });
    }
    if (!auth.isAdmin) return json({ error: 'Forbidden (admin only)' }, 403);

    if (action === 'months' || action === 'scan' || action === 'deductions' || action === 'log_append') {
      if (!body?.consultant_id) return json({ error: 'consultant_id saknas' }, 400);
    }

    const loadConsultant = async () => {
      const { data, error } = await db.from('consultants').select('*').eq('id', body.consultant_id).maybeSingle();
      if (error || !data) throw new Error('Konsulten hittades inte');
      return data;
    };

    if (action === 'months') {
      const consultant = await loadConsultant();
      if (!consultant.drive_folder_id) return json({ error: 'Konsulten saknar Löner-mapp (drive_folder_id)' }, 400);
      const drive = new DriveReader();
      const [folders, children] = await Promise.all([
        drive.listChildren(consultant.drive_folder_id, { foldersOnly: true }),
        drive.listChildren(consultant.drive_folder_id),
      ]);
      const logSheet = children.find(f => f.mimeType === 'application/vnd.google-apps.spreadsheet' && /konsultl[öo]ner/i.test(f.name) && /logg/i.test(f.name));
      if (logSheet && consultant.log_sheet_id !== logSheet.id) {
        await db.from('consultants').update({ log_sheet_id: logSheet.id }).eq('id', consultant.id);
      }
      const { data: payouts } = await db
        .from('consultant_payouts')
        .select('id, status, kind, invoice_number, payout_month, drive_month_folder_id')
        .eq('consultant_id', consultant.id);
      const months = folders
        .map(f => {
          const payout_month = parseMonthFolderName(f.name);
          const existing = (payouts ?? []).filter(p => p.kind === 'payout').find(p => p.drive_month_folder_id === f.id || (payout_month && p.payout_month === payout_month));
          return { id: f.id, name: f.name, createdTime: f.createdTime, modifiedTime: f.modifiedTime, payout_month, existing_payout: existing ? { id: existing.id, status: existing.status, invoice_number: existing.invoice_number } : null };
        })
        .sort((a, b) => String(b.createdTime ?? '').localeCompare(String(a.createdTime ?? '')));
      return json({ months, log_sheet: logSheet ? { id: logSheet.id, name: logSheet.name, webViewLink: logSheet.webViewLink } : null });
    }

    if (action === 'scan') {
      if (!body?.folder_id) return json({ error: 'folder_id saknas' }, 400);
      return json(await scanFolder(new DriveReader(), body.folder_id));
    }

    if (action === 'provision') {
      if (!body?.file_id) return json({ error: 'file_id saknas' }, 400);
      return json(await parseProvision(new DriveReader(), body.file_id));
    }

    if (action === 'deductions') {
      const fileIds: string[] = Array.isArray(body?.file_ids) ? body.file_ids.slice(0, 8) : [];
      if (!fileIds.length) return json({ error: 'file_ids saknas' }, 400);
      const consultant = await loadConsultant();
      const drive = new DriveReader();
      const subfolders: Record<string, string> = body?.subfolder_by_file && typeof body.subfolder_by_file === 'object' ? body.subfolder_by_file : {};

      const parseOne = async (fileId: string) => {
        try {
          const file = await drive.getFile(fileId);
          const bytes = await drive.download(fileId);
          let binary = '';
          const chunk = 8192;
          for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          const dataUrl = `data:${file.mimeType || 'application/pdf'};base64,${btoa(binary)}`;
          const parsed = await callAi(DEDUCTION_PROMPT, 'Tolka kvittot/kravet och returnera JSON enligt schemat.', dataUrl);
          const docNumberNorm = normalizeDocNumber(parsed.doc_number);
          return {
            file: { id: file.id, name: file.name, mimeType: file.mimeType, modifiedTime: file.modifiedTime, webViewLink: file.webViewLink, subfolder: subfolders[fileId] },
            parsed: {
              doc_type: parsed.doc_type ?? 'annat',
              issuer: parsed.issuer ?? null,
              doc_date: parsed.doc_date ?? null,
              reg_nr: parsed.reg_nr ?? null,
              doc_number: parsed.doc_number ?? null,
              original_amount: num(parsed.original_amount),
              fee_amount: num(parsed.fee_amount),
              amount_total: num(parsed.amount_total) ?? 0,
              description: parsed.description ?? '',
              is_reminder: Boolean(parsed.is_reminder),
              is_owner_cost_candidate: Boolean(parsed.is_owner_cost_candidate),
            },
            doc_number_norm: docNumberNorm,
          };
        } catch (e) {
          return { file: { id: fileId, name: subfolders[fileId] ? undefined : undefined }, error: e instanceof Error ? e.message : 'Okänt fel' };
        }
      };

      const items: any[] = [];
      for (let i = 0; i < fileIds.length; i += 4) {
        items.push(...await Promise.all(fileIds.slice(i, i + 4).map(parseOne)));
      }

      // Dubblettkoll mot databasen och inom svaret.
      const { data: existing } = await db
        .from('consultant_payout_lines')
        .select('id, drive_file_id, doc_number_norm, doc_type, reg_nr, doc_date, amount, payout_id, included, consultant_payouts(payout_month, invoice_number, status)')
        .eq('consultant_id', consultant.id)
        .eq('included', true);
      const ownPayoutId = typeof body?.payout_id === 'string' ? body.payout_id : null;
      const rows = (existing ?? []).filter((r: any) => r.consultant_payouts?.status !== 'draft' && (!ownPayoutId || r.payout_id !== ownPayoutId));
      const findDuplicate = (item: any) => {
        const p = item.parsed;
        const match = rows.find((r: any) =>
          (item.file.id && r.drive_file_id === item.file.id) ||
          (item.doc_number_norm && r.doc_number_norm === item.doc_number_norm) ||
          (r.doc_type === p.doc_type && r.reg_nr && p.reg_nr && r.reg_nr === p.reg_nr &&
            String(r.doc_date ?? '') === String(p.doc_date ?? '') && Number(r.amount) === Number(p.amount_total)));
        if (!match) return null;
        const payout = (match as any).consultant_payouts;
        return { line_id: match.id, payout_month: payout?.payout_month ?? null, invoice_number: payout?.invoice_number ?? null };
      };
      const seenInBatch = new Set<string>();
      for (const item of items) {
        if (item.error) continue;
        const key = item.doc_number_norm || `file:${item.file.id}`;
        if (seenInBatch.has(key)) {
          item.duplicate_of = { line_id: null, payout_month: null, invoice_number: null, in_batch: true };
          continue;
        }
        seenInBatch.add(key);
        item.duplicate_of = findDuplicate(item);
      }
      return json({ items });
    }

    if (action === 'log_append') {
      const consultant = await loadConsultant();
      const rows: unknown[][] = Array.isArray(body?.rows) ? body.rows : [];
      if (!rows.length) return json({ error: 'rows saknas' }, 400);
      if (!consultant.log_sheet_id) return json({ error: 'Loggarket saknas — skapa "Konsultlöner – logg" i Löner-mappen och dela det med servicekontot' }, 400);
      const sheets = new SheetsClient();
      await sheets.ensureHeader(consultant.log_sheet_id);
      await sheets.appendRows(consultant.log_sheet_id, 'A:Z', rows as (string | number | null)[][]);
      return json({ ok: true, appended: rows.length });
    }

    return json({ error: `Okänd action: ${action}` }, 400);
  } catch (e) {
    console.error('consultant-drive error', e);
    return json({ error: e instanceof Error ? e.message : 'Okänt fel' }, 500);
  }
});
