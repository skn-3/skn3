import { cases, ownScope, checkedId, visibleCase, rows, searchWords, text, type ReadTool } from './context.ts';
export const searchEvents: ReadTool={
 name:'search_events',description:'Sök synliga ärendehändelser under senaste 30 dagarna som standard; days anger annan tillbakablick. Max 20.',
 schema:{type:'object',properties:{case_id:{type:'string'},query:{type:'string'},days:{type:'number'}},additionalProperties:false},
 async handler(args,ctx){ const days=args.days===undefined?30:Number(args.days);if(!Number.isInteger(days)||days<1||days>366)throw new Error('Dagar måste vara 1–366');let q=ctx.userClient.from('case_events').select('id,case_id,event_type,description,created_by,created_at').gte('created_at',new Date(ctx.now.getTime()-days*86400000).toISOString());
 if(args.case_id){const id=checkedId(args);if(!await visibleCase(id,ctx))return {error:'Ärendet finns inte eller är inte synligt för dig.'};q=q.eq('case_id',id);}
 else if(ctx.role==='seller'&&!ctx.isAdmin){q=ctx.userClient.from('case_events').select('id,case_id,event_type,description,created_by,created_at,cases!inner(seller)').eq('cases.seller',ctx.name).gte('created_at',new Date(ctx.now.getTime()-days*86400000).toISOString());}
 q=searchWords(q,text(args.query),['description','event_type']);const events=await rows(q.order('created_at',{ascending:false}));
 const ids=[...new Set<string>(events.map((event: {case_id:string})=>event.case_id).filter(Boolean))];
 if(!ids.length)return {events:[],limit:20};
 // Resolve identities with the caller's client/view and seller scope, never service access.
 const identities=await rows(ownScope(cases(ctx).select('id,address,city,customer_name,status').in('id',ids),ctx));
 const byId=new Map(identities.map((item: {id:string;address:string;city:string|null;customer_name:string|null;status:string})=>[item.id,item]));
 const enriched=events.flatMap((event: {case_id:string})=>{
   const identity=byId.get(event.case_id);if(!identity)return [];
   ctx.seenCaseIds.add(event.case_id);
   return [{...event,address:identity.address,city:identity.city,customer_name:identity.customer_name,status:identity.status}];
 });
 return {events:enriched,limit:20}; }
};
