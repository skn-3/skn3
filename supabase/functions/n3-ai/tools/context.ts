import { UUID, boundedResult } from '../logic.ts';
// Structural read-only client boundary also allows pure tests without Deno package imports.
export interface ToolContext { userClient: { from: (table: string) => any }; name: string; role: string; isAdmin: boolean; now: Date; seenCaseIds: Set<string> }
export interface ReadTool { name: string; description: string; schema: Record<string, unknown>; handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown> }
export const CASE_FIELDS = 'id,address,city,customer_name,status,team,km_team,seller,km_date,montage_date,delivery_week,delivery_year,order_number,offer_number';
export function cases(ctx: ToolContext) { return ctx.userClient.from(ctx.role === 'montor' ? 'cases_montor' : 'cases'); }
export function ownScope(query: any, ctx: ToolContext) { if(ctx.role==='seller' && !ctx.isAdmin) return query.eq('seller',ctx.name); return query; }
export function checkedId(args: Record<string, unknown>) { if(typeof args.case_id !== 'string' || !UUID.test(args.case_id)) throw new Error('Ogiltigt ärende-id'); return args.case_id; }
export function text(value: unknown, max=200) { if (value === undefined || value === null) return ''; if(typeof value !== 'string' || value.length>max) throw new Error('Ogiltig söktext'); return value.trim(); }
export function searchWords(query: any, phrase: string, fields: string[]) {
  const words=phrase.split(/\s+/).filter(Boolean);
  if(words.length>12)throw new Error('Sök med högst 12 ord');
  const groups=words.map(word=>{
    if(/[(),"\\]/.test(word))throw new Error('Sök med ord utan parenteser, citattecken eller kommatecken');
    const safe=word.replace(/[%_]/g,'\\$&');
    return 'or('+fields.map(f=>`${f}.ilike.${JSON.stringify('%'+safe+'%')}`).join(',')+')';
  });
  return groups.length?query.or('and('+groups.join(',')+')'):query;
}
export async function rows(query: any, ctx?: ToolContext) { const {data,error}=await query.limit(20); if(error) throw new Error(error.message); if(ctx) for(const row of data??[]) if(row.id)ctx.seenCaseIds.add(row.id); return data??[]; }
export async function visibleCase(id: string, ctx: ToolContext) { const result=await rows(ownScope(cases(ctx).select(CASE_FIELDS).eq('id',id),ctx),ctx); return result[0]; }
export async function safeExecute(tool: ReadTool,args: Record<string,unknown>,ctx: ToolContext) { try { return boundedResult(await tool.handler(args,ctx)); } catch(e) { return {error:e instanceof Error?e.message:'Uppgifterna kunde inte hämtas'}; } }
