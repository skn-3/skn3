import { describe,it,expect } from 'vitest';
import { validateCostArgs,actionDecisionError,ownReceiptPath } from '../../../supabase/functions/n3-ai/actions/logic';
import { executeAddCost } from '../../../supabase/functions/n3-ai/actions/executeAddCost';
import { decideAction } from '../../../supabase/functions/n3-ai/actions/index';
import type { ActionContext } from '../../../supabase/functions/n3-ai/actions/proposeAddCost';
const id='00000000-0000-4000-8000-000000000001';
const args={case_id:id,amount:2500,description:' Extra fogning '};
describe('kostnadsförslag',()=>{
 it('validerar ärende, numeriskt belopp och trimmad beskrivning',()=>expect(validateCostArgs(args)).toEqual({...args,description:'Extra fogning'}));
 it('kräver belopp över noll',()=>{expect(()=>validateCostArgs({...args,amount:0})).toThrow();expect(()=>validateCostArgs({...args,amount:-1})).toThrow();});
 it('tillåter högst 200 000 kr',()=>{expect(validateCostArgs({...args,amount:200000}).amount).toBe(200000);expect(()=>validateCostArgs({...args,amount:200001})).toThrow();});
 it('kräver minst tre tecken i beskrivningen',()=>{expect(()=>validateCostArgs({...args,description:' ab '})).toThrow();expect(validateCostArgs({...args,description:'abc'}).description).toBe('abc');});
 it('avvisar ogiltigt ärende och icke-numeriska belopp',()=>{expect(()=>validateCostArgs({...args,case_id:'bad'})).toThrow();expect(()=>validateCostArgs({...args,amount:'2500'})).toThrow();});
 it('går ut vid exakt 15 minuter',()=>{const action={status:'pending',created_at:'2026-10-25T12:00:00Z'};expect(actionDecisionError(action,new Date('2026-10-25T12:14:59Z'))).toBeNull();expect(actionDecisionError(action,new Date('2026-10-25T12:15:00Z'))).toBe('Förslaget har gått ut.');});
 it.each(['confirmed','cancelled','expired','failed'])('avvisar confirm efter beslut %s',status=>expect(actionDecisionError({status,created_at:new Date().toISOString()})).toBe('Förslaget är redan beslutat eller behandlas.'));
 it('avvisar en åtgärd som redan håller på att genomföras',()=>expect(actionDecisionError({status:'pending',decided_at:new Date().toISOString(),created_at:new Date().toISOString()})).not.toBeNull());
 it('kvittot måste ligga i användarens egen mapp',()=>{expect(ownReceiptPath(`${id}/${id}.jpg`,id)).toBe(true);expect(ownReceiptPath(`annan/${id}.jpg`,id)).toBe(false);expect(ownReceiptPath(`${id}/../x.jpg`,id)).toBe(false);});
});
it('kostnadsbekräftelse skriver användarens namn och via N3prenad-AI efter primärinsert',async()=>{
 const inserts:{table:string;payload:any}[]=[];const context:ActionContext={userId:id,threadId:id,name:'Testmontör',role:'montor',isAdmin:false,now:new Date(),seenCaseIds:new Set(),adminClient:{},userClient:{from:(table:string)=>{
 const q={select:()=>q,eq:()=>q,limit:async()=>({data:[{id,address:'Havsvägen 4'}],error:null}),insert:(payload:any)=>{inserts.push({table,payload});return {select:()=>({single:async()=>({data:{id},error:null})}),error:table==='case_events'?{message:'event failed'}:null};}};return q;
 }}};
 const result=await executeAddCost({id,payload:args},context);
 expect(inserts.map(x=>x.table)).toEqual(['case_costs','case_events','activity_log']);expect(inserts[0].payload).toMatchObject({id,amount:2500,description:'Extra fogning',created_by:'Testmontör',category:'ovrigt',responsible:null});
 expect(inserts[1].payload).toMatchObject({event_type:'cost',created_by:'Testmontör'});expect(inserts[1].payload.description).toContain('via N3prenad-AI');expect(result.cost_id).toBe(id);expect(result.warnings).toEqual(['Historiken kunde inte uppdateras.']);
});
it('confirm på redan beslutat förslag når aldrig kostnadsinsert',async()=>{
 let writes=0;const context={userId:id,adminClient:{rpc:async()=>({data:{error:'Förslaget är redan beslutat eller behandlas.'},error:null})},userClient:{from:()=>{writes++;throw new Error('unexpected write');}}} as unknown as ActionContext;
 expect(await decideAction(id,'confirm',context)).toMatchObject({error_code:'action_decided'});expect(writes).toBe(0);
});