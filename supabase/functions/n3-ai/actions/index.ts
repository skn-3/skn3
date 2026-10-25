import { proposeAddCost, type ActionContext } from './proposeAddCost.ts';
import { executeAddCost } from './executeAddCost.ts';
// Adding an action requires both a proposal tool and an explicit confirmation executor.
export const actionTools=[proposeAddCost];
const executors:Record<string,(action:any,ctx:ActionContext)=>Promise<any>>={add_cost:executeAddCost};
export async function decideAction(actionId:string,decision:'confirm'|'cancel',ctx:ActionContext){
 const claim=await ctx.adminClient.rpc('ai_claim_action',{p_action_id:actionId,p_user_id:ctx.userId});if(claim.error)throw new Error(claim.error.message);
 if(claim.data.error)return {reply:claim.data.error,error_code:'action_decided'};
 const action=claim.data.action;let status=claim.data.expired?'expired':decision==='cancel'?'cancelled':'confirmed';let result:any=null;let error:string|null=null;
 let reply=status==='expired'?'Förslaget har gått ut. Be om ett nytt förslag.':'Okej, ingen kostnad tillagd.';
 if(status==='confirmed'){try{const execute=executors[action.kind];if(!execute)throw new Error('Åtgärden stöds inte.');result=await execute(action,ctx);reply=`Kostnad ${Number(result.amount).toLocaleString('sv-SE')} kr tillagd på ${result.address}.`;if(result.warnings.length)reply+=' '+result.warnings.join(' ');}catch(e){status='failed';error=e instanceof Error?e.message:'Kostnaden kunde inte sparas.';reply=`Ingen kostnad tillagd. ${error}`;}}
 const updated=await ctx.adminClient.from('ai_actions').update({status,result,error,decided_at:new Date().toISOString()}).eq('id',action.id);if(updated.error)throw new Error(updated.error.message);
 const case_ids=result?[result.case_id]:[];
 const saved=await ctx.adminClient.from('ai_messages').insert({thread_id:action.thread_id,role:'assistant',content:reply,case_ids}).select('id').single();if(saved.error)throw new Error(saved.error.message);
 return {reply,message_id:saved.data.id,case_ids,thread_id:action.thread_id,...(status==='failed'?{error_code:'action_failed'}:{})};
}