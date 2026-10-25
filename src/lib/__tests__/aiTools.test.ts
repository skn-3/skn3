import { it, expect } from 'vitest';
import { cases, ownScope, searchWords, safeExecute, type ToolContext } from '../../../supabase/functions/n3-ai/tools/context';
import { getCase } from '../../../supabase/functions/n3-ai/tools/getCase';
import { searchEvents } from '../../../supabase/functions/n3-ai/tools/searchEvents';
import { summarizeAiUsage } from '../aiUsage';
const ctx=(role:string):ToolContext=>({role,name:'Alex NBD',isAdmin:false,now:new Date(),seenCaseIds:new Set(),userClient:{from:(table:string)=>table} as never});
it('montörverktyg använder endast cases_montor',()=>{expect(cases(ctx('montor'))).toBe('cases_montor');expect(cases(ctx('seller'))).toBe('cases');});
it('säljare begränsas till sitt namn utan adminbehörighet',()=>{let args:unknown[]=[];const q={eq:(...a:unknown[])=>{args=a;return q;}};ownScope(q,ctx('seller'));expect(args).toEqual(['seller','Alex NBD']);});
it('alla sökord måste matcha något fält i en gemensam AND-grupp',()=>{let filter='';searchWords({or:(s:string)=>{filter=s;}},'Testvägen kund',['address','customer_name']);expect(filter).toBe('and(or(address.ilike."%Testvägen%",customer_name.ilike."%Testvägen%"),or(address.ilike."%kund%",customer_name.ilike."%kund%"))');});
it('sökning tillåter inte att text ändrar filtergrammatiken',()=>{expect(()=>searchWords({},'x),status.eq.ny',['address'])).toThrow();});
it('verktygsfel blir data och kraschar inte modellanropet',async()=>{const result=await safeExecute(getCase,{case_id:'invalid'},ctx('montor'));expect(result).toEqual({error:'Ogiltigt ärende-id'});});
it('search_events berikar varje händelse med synlig ärendeadress och identitet',async()=>{
 const identities=[{id:'case-a',address:'Testvägen 1',city:'Visby',customer_name:'Anna',status:'montage_pagar'},{id:'case-b',address:'Testvägen 2',city:'Uppsala',customer_name:'Bo',status:'km_bokad'}];
 const events=[{case_id:'case-a',description:'Ordernummer ändrat'},{case_id:'case-b',description:'KM bokad'},{case_id:'case-a',description:'Montage påbörjat'}];
 const tables:string[]=[];let selectedIds:unknown;
 const context=ctx('montor');context.userClient={from:(table:string)=>{
   tables.push(table);const query={select:()=>query,gte:()=>query,order:()=>query,in:(_column:string,ids:unknown)=>{selectedIds=ids;return query;},limit:async()=>({data:table==='case_events'?events:identities,error:null})};return query;
 }};
 const result=await searchEvents.handler({},context) as {events:Record<string,unknown>[]};
 expect(tables).toEqual(['case_events','cases_montor']);expect(selectedIds).toEqual(['case-a','case-b']);
 expect(result.events).toHaveLength(3);
 for(const event of result.events){const identity=identities.find(item=>item.id===event.case_id);expect(identity).toBeDefined();expect(event).toMatchObject({address:identity?.address,city:identity?.city,customer_name:identity?.customer_name,status:identity?.status});}
});
it('search_events utelämnar händelser när ärendet inte är synligt vid uppslag',async()=>{
 const context=ctx('montor');context.userClient={from:(table:string)=>{const query={select:()=>query,gte:()=>query,order:()=>query,in:()=>query,limit:async()=>({data:table==='case_events'?[{case_id:'hidden',description:'Hemligt'}]:[],error:null})};return query;}};
 expect(await searchEvents.handler({},context)).toEqual({events:[],limit:20});expect(context.seenCaseIds.size).toBe(0);
});
it('AI-usage skiljer dagstak från skickade användarfrågor',()=>{const row={user_id:'u',prompt_tokens:10,completion_tokens:5,total_tokens:15,created_at:'2026-10-26T01:00:00Z'};const totals=summarizeAiUsage([{...row,status:'ok'},{...row,status:'limit',total_tokens:0}], '2026-10-25T23:00:00Z');expect(totals.today).toEqual({messages:1,tokens:15});expect(totals.limits).toBe(1);});
