import { cases, ownScope, checkedId, visibleCase, rows, searchWords, text, type ReadTool } from './context.ts';
export const searchEvents: ReadTool={
 name:'search_events',description:'Sök synliga ärendehändelser under senaste 30 dagarna som standard; days anger annan tillbakablick. Max 20.',
 schema:{type:'object',properties:{case_id:{type:'string'},query:{type:'string'},days:{type:'number'}},additionalProperties:false},
 async handler(args,ctx){ const days=args.days===undefined?30:Number(args.days);if(!Number.isInteger(days)||days<1||days>366)throw new Error('Dagar måste vara 1–366');let q=ctx.userClient.from('case_events').select('id,case_id,event_type,description,created_by,created_at').gte('created_at',new Date(ctx.now.getTime()-days*86400000).toISOString());
 if(args.case_id){const id=checkedId(args);if(!await visibleCase(id,ctx))return {error:'Ärendet finns inte eller är inte synligt för dig.'};q=q.eq('case_id',id);}
 else if(ctx.role==='seller'&&!ctx.isAdmin){const owned=await rows(ownScope(cases(ctx).select('id'),ctx));if(!owned.length)return {events:[]};q=q.in('case_id',owned.map((c:any)=>c.id));}
 q=searchWords(q,text(args.query),['description','event_type']);const events=await rows(q.order('created_at',{ascending:false}));for(const event of events)if(event.case_id)ctx.seenCaseIds.add(event.case_id);return {events,limit:20}; }
};
