import { cases, ownScope, searchWords, rows, text, CASE_FIELDS, type ReadTool, type ToolContext } from './context.ts';
import { parseAddress, rankCases, searchTokens } from '../../_shared/caseMatching.ts';

// Kandidater för gemensam caseMatching: hämtas via husnummer eller namnord, alltid med anroparens RLS.
async function matchCandidates(query: string, ctx: ToolContext) {
  const parsed = parseAddress(query);
  let q = ownScope(cases(ctx).select(CASE_FIELDS), ctx);
  if (parsed.valid) q = q.ilike('address', `%${parsed.number}%`);
  else {
    const words = searchTokens(query).filter(w => w.length >= 3 && !/^\d/.test(w)).slice(0, 4);
    if (!words.length) return [];
    q = q.or(words.map(w => `customer_name.ilike.%${w}%`).join(','));
  }
  const { data, error } = await q.limit(500);
  if (error) throw new Error(error.message);
  const ranked = rankCases((data ?? []) as any[], parsed.valid ? { address: query } : { name: query }, { limit: 10 });
  return ranked.map(r => ({ ...r.case, match: r.label }));
}

export const searchCases: ReadTool = {
 name:'search_cases', description:'Sök ärenden med ord i adress, kundnamn, ort, ordernummer eller affärsförslagsnummer. Tål stavfel och olika skrivsätt av adresser (t.ex. med eller utan ort). Högst 20 träffar.',
 schema:{type:'object',properties:{query:{type:'string'},status:{type:'string'}},required:['query'],additionalProperties:false},
 async handler(args,ctx){
  const query=text(args.query); const status=text(args.status);
  let q=ownScope(cases(ctx).select(CASE_FIELDS),ctx); q=searchWords(q,query.replace(/,/g,' '),['address','customer_name','city','order_number','offer_number']); if(status)q=q.eq('status',status);
  const exact=await rows(q.order('address'),ctx);
  let matched: any[]=[];
  try { matched=(await matchCandidates(query,ctx)).filter(c=>!status||c.status===status); } catch { matched=[]; }
  const seen=new Set<string>(); const out: any[]=[];
  for(const c of [...matched,...exact]){ if(seen.has(c.id))continue; seen.add(c.id); out.push(c); if(out.length>=20)break; }
  for(const c of out) if(c.id) ctx.seenCaseIds.add(c.id);
  return {cases:out,limit:20};
 }
};
