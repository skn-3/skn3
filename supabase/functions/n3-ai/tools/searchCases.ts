import { cases, ownScope, searchWords, rows, text, CASE_FIELDS, type ReadTool } from './context.ts';
export const searchCases: ReadTool = {
 name:'search_cases', description:'Sök ärenden med ord i adress, kundnamn, ort, ordernummer eller affärsförslagsnummer. Alla ord måste matcha. Högst 20 träffar.',
 schema:{type:'object',properties:{query:{type:'string'},status:{type:'string'}},required:['query'],additionalProperties:false},
 async handler(args,ctx){ let q=ownScope(cases(ctx).select(CASE_FIELDS),ctx); q=searchWords(q,text(args.query),['address','customer_name','city','order_number','offer_number']); const status=text(args.status);if(status)q=q.eq('status',status);return {cases:await rows(q.order('address'),ctx),limit:20}; }
};
