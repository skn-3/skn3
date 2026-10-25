import { scopeInterval, type AiScope } from '../logic.ts';
import { cases, ownScope, rows, CASE_FIELDS, type ReadTool } from './context.ts';
export const listMyCases: ReadTool={
 name:'list_my_cases',description:'Lista egna ärenden för idag, innevarande ISO-vecka, kommande 14 dagar eller alla aktiva. KM eller montage räknas i datumintervallet.',
 schema:{type:'object',properties:{scope:{type:'string',enum:['today','week','upcoming','active']}},required:['scope'],additionalProperties:false},
 async handler(args,ctx){ if(!['today','week','upcoming','active'].includes(String(args.scope)))throw new Error('Ogiltigt intervall');const interval=scopeInterval(args.scope as AiScope,ctx.now);let q=ownScope(cases(ctx).select(CASE_FIELDS),ctx);if(!interval || ctx.role==='coordinator'||ctx.isAdmin)q=q.not('status','in','(montage_klart,fakturerad)');if(interval)q=q.or(`and(km_date.gte.${interval.start},km_date.lte.${interval.end}),and(montage_date.gte.${interval.start},montage_date.lte.${interval.end})`);const data=await rows(q.order('montage_date',{nullsFirst:false}).order('km_date',{nullsFirst:false}),ctx);data.sort((a:any,b:any)=>{ const next=(c:any)=>[c.km_date,c.montage_date].filter((d:string)=>d&&(!interval||(d>=interval.start&&d<=interval.end))).sort()[0]??'9999';return next(a).localeCompare(next(b)); });return {cases:data,interval,limit:20}; }
};
