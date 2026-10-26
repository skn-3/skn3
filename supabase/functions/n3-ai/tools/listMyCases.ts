import { scopeInterval, type AiScope } from '../logic.ts';
import { cases, ownScope, type ReadTool, type ToolContext } from './context.ts';
const LIST_FIELDS='id,address,city,customer_name,status,seller,km_date,montage_date,delivery_week,delivery_year,order_number';
const MISSING=['order_number','km_date','montage_date','delivery_week'] as const;
export type MissingField=typeof MISSING[number];
export function missingFilter(args:Record<string,unknown>):MissingField|null{
 if(args.missing===undefined||args.missing===null)return null;
 if(!(MISSING as readonly string[]).includes(String(args.missing)))throw new Error('Ogiltigt filter. Använd order_number, km_date, montage_date eller delivery_week.');
 return args.missing as MissingField;
}
export const listMyCases: ReadTool={
 name:'list_my_cases',description:'Lista egna ärenden för idag, innevarande ISO-vecka, kommande 14 dagar eller alla aktiva, högst 50 rader. KM eller montage räknas i datumintervallet. Filtret missing listar ärenden som saknar ordernummer, KM-datum, montagedatum eller leveransvecka.',
 schema:{type:'object',properties:{scope:{type:'string',enum:['today','week','upcoming','active']},missing:{type:'string',enum:[...MISSING]}},required:['scope'],additionalProperties:false},
 async handler(args,ctx){ if(!['today','week','upcoming','active'].includes(String(args.scope)))throw new Error('Ogiltigt intervall');const missing=missingFilter(args);const interval=scopeInterval(args.scope as AiScope,ctx.now);let q=ownScope(cases(ctx).select(LIST_FIELDS),ctx);if(!interval || ctx.role==='coordinator'||ctx.isAdmin)q=q.not('status','in','(montage_klart,fakturerad)');if(interval)q=q.or(`and(km_date.gte.${interval.start},km_date.lte.${interval.end}),and(montage_date.gte.${interval.start},montage_date.lte.${interval.end})`);if(missing)q=q.is(missing,null);const {data,error}=await q.order('montage_date',{nullsFirst:false}).order('km_date',{nullsFirst:false}).limit(50);if(error)throw new Error(error.message);const rows=data??[];for(const row of rows)if(row.id)ctx.seenCaseIds.add(row.id);rows.sort((a:any,b:any)=>{ const next=(c:any)=>[c.km_date,c.montage_date].filter((d:string)=>d&&(!interval||(d>=interval.start&&d<=interval.end))).sort()[0]??'9999';return next(a).localeCompare(next(b)); });return {cases:rows,interval,...(missing?{missing}:{}) ,limit:50}; }
};
