import { describe,it,expect } from 'vitest';
import { validateBooking,installerActionError } from '../../../supabase/functions/n3-ai/actions/installerLogic';
import { proposePartialReport } from '../../../supabase/functions/n3-ai/actions/proposePartialReport';
import { saveProposal } from '../../../supabase/functions/n3-ai/actions/proposal';
import { executeInstaller } from '../../../supabase/functions/n3-ai/actions/executeInstaller';
import type { ActionContext } from '../../../supabase/functions/n3-ai/actions/proposeAddCost';
const id='00000000-0000-4000-8000-000000000001',now=new Date('2026-10-26T07:08:00Z');
const ctx={role:'montor',name:'Testmontör',isAdmin:false};
const booked={id,address:'Havsvägen 4',customer_name:'Testkund',status:'montage_bokat',team:'Testmontör',montage_date:'2026-10-29',delivery_week:44};
describe('AI-bokningsdatum',()=>{
 it('avvisar passerat datum',()=>expect(()=>validateBooking('2026-10-25',undefined,now)).toThrow());
 it('tillåter idag',()=>expect(validateBooking('2026-10-26','08:00',now)).toEqual({date:'2026-10-26',time:'08:00'}));
 it('tillåter exakt 365 dagar men avvisar 366',()=>{expect(validateBooking('2027-10-26',undefined,now).date).toBe('2027-10-26');expect(()=>validateBooking('2027-10-27',undefined,now)).toThrow();});
 it.each(['26/10/2026','2026-02-30','2026-1-26'])('avvisar felaktigt format eller kalenderdatum %s',date=>expect(()=>validateBooking(date,undefined,now)).toThrow());
 it('avvisar ogiltig tid',()=>expect(()=>validateBooking('2026-10-29','25:00',now)).toThrow());
});
it('nytt förslag går genom atomiska avbryt-och-skapa RPC:n',async()=>{
 const actions=[{status:'pending'},{status:'confirmed'}];
 const context={userId:id,threadId:id,adminClient:{rpc:async(name:string,args:any)=>{expect(name).toBe('ai_create_proposal');expect(args.p_thread_id).toBe(id);actions.filter(a=>a.status==='pending').forEach(a=>a.status='cancelled');actions.push({status:'pending'});return {data:id,error:null};}}} as unknown as ActionContext;
 await saveProposal('add_note',{case_id:id},'Anteckning',[],context);
 expect(actions.map(a=>a.status)).toEqual(['cancelled','confirmed','pending']);
});
it('förbjuden status ger error utan att något förslag sparas',async()=>{
 const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{...booked,status:'montage_klart'},error:null})};
 const context={...ctx,now,userId:id,threadId:id,seenCaseIds:new Set(),userClient:{from:()=>q},adminClient:{rpc:()=>{throw new Error('Must not write');}}} as ActionContext;
 expect(await proposePartialReport.handler({case_id:id,remaining:'Lister saknas'},context)).toEqual({error:'Montage måste vara bokat eller pågående först.'});
});
it('förbjuden roll ger error',()=>expect(installerActionError('partial_report',booked,{...ctx,role:'seller'},{})).toContain('endast'));
it('start använder samma leveransgrind som statusRules',()=>expect(installerActionError('start_montage',{...booked,delivery_week:null},ctx,{})).toContain('leveransdatum'));
it('montage klart behöver inte leveransdatum',()=>expect(installerActionError('complete_montage',{...booked,delivery_week:null},ctx,{})).toBeNull());
it.each(['partial_report','book_montage'])('bekräftad %s uppdaterar ärendet och rätt händelse med användarens namn',async kind=>{
 const writes:{table:string;payload:any}[]=[];let updating=false;
 const c=kind==='book_montage'?{...booked,status:'leverans_klar',montage_date:null}:booked;
 const q:any={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:async()=>({data:c,error:null}),update:(payload:any)=>{updating=true;writes.push({table:'cases',payload});return q;},insert:(payload:any)=>{writes.push({table:'event',payload});return Promise.resolve({error:null});},then:(resolve:any)=>resolve({data:updating?[{id}]:[],error:null})};
 const context={...ctx,now,userId:id,threadId:id,seenCaseIds:new Set(),userClient:{from:(table:string)=>table==='cases'||table==='cases_montor'?q:{insert:(payload:any)=>{writes.push({table,payload});return Promise.resolve({error:null});}}},adminClient:{}} as ActionContext;
 await executeInstaller({id,kind,payload:{case_id:id,...(kind==='partial_report'?{remaining:'Lister saknas'}:{date:'2026-10-29',time:'08:00'})}},context);
 expect(writes[0].payload).toMatchObject(kind==='partial_report'?{status:'montage_pagar',montage_partial_note:'Lister saknas'}:{status:'montage_bokat',montage_date:'2026-10-29',montage_time:'08:00'});
 const event=writes.find(w=>w.table==='case_events');expect(event?.payload).toMatchObject({event_type:kind==='partial_report'?'montage_delrapport':'montage_booked',created_by:'Testmontör'});expect(event?.payload.description).toContain('via N3prenad-AI');
});