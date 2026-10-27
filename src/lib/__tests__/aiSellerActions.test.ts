import { describe,it,expect } from 'vitest';
import { validateCaseChanges, describeCaseChanges, statusGateError, validateExtraHoursArgs, matchRecipient, validateCreateCaseArgs, validateChatMessageArgs } from '../../../supabase/functions/n3-ai/actions/sellerLogic';
import { proposeUpdateCase, proposeSetStatus, proposeSendChatMessage } from '../../../supabase/functions/n3-ai/actions/proposeSeller';
import { missingFilter } from '../../../supabase/functions/n3-ai/tools/listMyCases';
import type { ActionContext } from '../../../supabase/functions/n3-ai/actions/proposeAddCost';
const id='00000000-0000-4000-8000-000000000001';
const base={id,address:'Storgatan 1',city:'Visby',customer_name:'Kund',status:'km_klar',team:'GVMO',montage_date:'2026-10-29',delivery_week:44,delivery_year:2026,extra_hours_requested:5,extra_hours_approved:0,seller:'Säljaren'};
const caseCtx=(c:any=base,role='seller')=>{
 const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:c,error:null})};
 return {role,name:'Säljaren',isAdmin:false,now:new Date('2026-10-26T07:08:00Z'),userId:id,threadId:id,seenCaseIds:new Set(),userClient:{from:()=>q},adminClient:{rpc:async()=>({data:id,error:null})}} as unknown as ActionContext;
};
describe('propose_update_case-fältvitlista',()=>{
 it('otillåtet fält avvisas',()=>expect(()=>validateCaseChanges({order_value:100})).toThrow('order_value'));
 it('otillåtet fält ger error utan att något sparas',async()=>{
  const ctx=caseCtx();ctx.adminClient={rpc:()=>{throw new Error('Must not write');}} as any;
  expect(await proposeUpdateCase.handler({case_id:id,changes:{status:'godkand'}},ctx)).toEqual({error:'Fältet status kan inte ändras här.'});
 });
 it('leveransvecka utanför 1–53 avvisas',()=>{expect(()=>validateCaseChanges({delivery_week:0,delivery_year:2026})).toThrow();expect(()=>validateCaseChanges({delivery_week:54,delivery_year:2026})).toThrow();});
 it('leveransvecka kräver år och ersätter exakt datum',()=>{
  expect(()=>validateCaseChanges({delivery_week:44})).toThrow('leveransår');
  expect(validateCaseChanges({delivery_week:44,delivery_year:2026})).toMatchObject({delivery_week:44,delivery_year:2026,delivery_date:null,delivery_time:null});
 });
 it('exakt leveransdatum ersätter vecka',()=>expect(validateCaseChanges({delivery_date:'2026-11-02'})).toMatchObject({delivery_date:'2026-11-02',delivery_week:null,delivery_year:null}));
 it('datum som inte finns avvisas',()=>{expect(()=>validateCaseChanges({delivery_date:'2026-02-30'})).toThrow('finns inte');expect(()=>validateCaseChanges({delivery_date:'30 oktober'})).toThrow('YYYY-MM-DD');});
 it('ändringsrader visar förut → nytt',()=>{
  const {rows,texts}=describeCaseChanges(validateCaseChanges({order_number:' 12345 ',delivery_week:45,delivery_year:2026}),base);
  expect(rows).toContainEqual({label:'Ordernummer',value:'— → 12345'});
  expect(rows).toContainEqual({label:'Leveransvecka',value:'v.44 → v.45'});
  expect(texts.join(', ')).toContain('Ordernummer ändrat till 12345');
  expect(texts.join(', ')).toContain('Leveransvecka ändrad till v.45 2026');
 });
});
describe('propose_set_status',()=>{
 it('icke tillåten övergång ger error utan att något sparas',async()=>{
  const ctx=caseCtx({...base,status:'vantar_km'});ctx.adminClient={rpc:()=>{throw new Error('Must not write');}} as any;
  const result=await proposeSetStatus.handler({case_id:id,status:'montage_klart'},ctx);
  expect(result).toEqual({error:'Montage måste vara bokat eller pågående först'});
 });
 it('leveransgrinden speglar statusRules',()=>expect(statusGateError('godkand',{...base,delivery_date:null,delivery_week:null})).toContain('leveransdatum'));
 it('tillåten övergång ger förslag med från → till',async()=>{
  const saved:any=await proposeSetStatus.handler({case_id:id,status:'montage_bokat'},caseCtx());
  expect(saved.needs_confirmation).toBe(true);
 });
 it('montörer avvisas',async()=>{
  const ctx=caseCtx(base,'montor');
  expect(await proposeSetStatus.handler({case_id:id,status:'godkand'},ctx)).toEqual({error:'Åtgärden är inte tillgänglig för din roll.'});
 });
});
describe('propose_set_extra_hours',()=>{
 it('begärda timmar kan inte ändras här',()=>expect(()=>validateExtraHoursArgs({requested:3},base)).toThrow('montören'));
 it('53 sålda och 0 begärda tillåter 23 godkända',()=>expect(validateExtraHoursArgs({approved:23},{...base,extra_hours_sold:53,extra_hours_requested:0})).toEqual({extra_hours_approved:23}));
 it.each([0,23.5,500])('tillåter %s godkända oavsett begärda',approved=>expect(validateExtraHoursArgs({approved},base)).toEqual({extra_hours_approved:approved}));
 it.each([-1,500.1,NaN,Infinity])('avvisar orimligt värde %s',approved=>expect(()=>validateExtraHoursArgs({approved},base)).toThrow('0 och 500'));
 it('godkända inom begärda går igenom',()=>expect(validateExtraHoursArgs({approved:5},base)).toEqual({extra_hours_approved:5}));
});
describe('list_my_cases missing-filter',()=>{
 it.each(['order_number','km_date','montage_date','delivery_week'])('tillåter %s',f=>expect(missingFilter({missing:f})).toBe(f));
 it('avvisar okänt filter',()=>expect(()=>missingFilter({missing:'order_value'})).toThrow());
});
describe('propose_send_chat_message-mottagare',()=>{
 const profiles=[{id:'a',name:'Mirna Malke',role:'coordinator'},{id:'b',name:'Mirna Test',role:'seller'},{id:'c',name:'Tomek',role:'montor'}];
 it('flera träffar kräver förtydligande',()=>expect(matchRecipient(profiles,'mirna','x').matches?.map(p=>p.name)).toEqual(['Mirna Malke','Mirna Test']));
 it('exakt namn träffar en',()=>expect(matchRecipient(profiles,'Tomek','x').match?.id).toBe('c'));
 it('användaren själv matchas inte',()=>expect(matchRecipient(profiles,'Tomek','c')).toEqual({}));
 it('verktyget svarar med namnlistan vid flera träffar',async()=>{
  const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:base,error:null}),then:(r:any)=>r({data:profiles,error:null})};
  const ctx=caseCtx();(ctx.userClient as any).from=()=>q;
  const result=await proposeSendChatMessage.handler({recipient_name:'mirna',text:'Hej'},ctx);
  expect((result as any).error).toContain('Mirna Malke');
 });
 it('är tillgängligt för alla roller, även montör',async()=>{
  const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:base,error:null}),then:(r:any)=>r({data:profiles,error:null})};
  const ctx=caseCtx(base,'montor');(ctx.userClient as any).from=()=>q;
  const result=await proposeSendChatMessage.handler({recipient_name:'Tomek',text:'Hej'},ctx);
  expect((result as any).needs_confirmation).toBe(true);
 });
});
describe('validering av nya ärenden och meddelanden',()=>{
 it('adress, ort och kundnamn krävs',()=>{expect(()=>validateCreateCaseArgs({address:'',city:'Visby',customer_name:'K'})).toThrow();expect(validateCreateCaseArgs({address:'Storgatan 1',city:'Visby',customer_name:'K'}).units).toBeNull();});
 it('meddelandetext krävs',()=>expect(()=>validateChatMessageArgs({recipient_name:'Mirna',text:'  '})).toThrow());
});
