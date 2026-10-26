import { proposeAddCost, type ActionContext } from './proposeAddCost.ts';
import { executeAddCost } from './executeAddCost.ts';
import { executeInstaller } from './executeInstaller.ts';
import { proposeReportProblem } from './proposeReportProblem.ts';
import { proposeAddNote } from './proposeAddNote.ts';
import { proposePartialReport } from './proposePartialReport.ts';
import { proposeCompleteMontage } from './proposeCompleteMontage.ts';
import { proposeStartMontage } from './proposeStartMontage.ts';
import { proposeBookKm } from './proposeBookKm.ts';
import { proposeBookMontage } from './proposeBookMontage.ts';
import { proposeRescheduleMontage } from './proposeRescheduleMontage.ts';
import { proposeCreateCase, proposeUpdateCase, proposeSetStatus, proposeSetExtraHours, proposeSendChatMessage } from './proposeSeller.ts';
import { executeSeller } from './executeSeller.ts';
// Adding an action requires both a proposal tool and an explicit confirmation executor.
export const actionTools=[proposeAddCost,proposeReportProblem,proposeAddNote,proposePartialReport,proposeCompleteMontage,proposeStartMontage,proposeBookKm,proposeBookMontage,proposeRescheduleMontage,proposeCreateCase,proposeUpdateCase,proposeSetStatus,proposeSetExtraHours,proposeSendChatMessage];
const executors:Record<string,(action:any,ctx:ActionContext)=>Promise<any>>={add_cost:executeAddCost,...Object.fromEntries(['report_problem','add_note','partial_report','complete_montage','start_montage','book_km','book_montage','reschedule_montage'].map(kind=>[kind,executeInstaller])),...Object.fromEntries(['create_case','update_case','set_status','set_extra_hours','send_chat_message'].map(kind=>[kind,executeSeller]))};
export async function decideAction(actionId:string,decision:'confirm'|'cancel',ctx:ActionContext){
 const claim=await ctx.adminClient.rpc('ai_claim_action',{p_action_id:actionId,p_user_id:ctx.userId});if(claim.error)throw new Error(claim.error.message);
 if(claim.data.error)return {reply:claim.data.error,error_code:'action_decided'};
 const action=claim.data.action;let status=claim.data.expired?'expired':decision==='cancel'?'cancelled':'confirmed';let result:any=null;let error:string|null=null;
  let reply=status==='expired'?'Förslaget har gått ut. Be om ett nytt förslag.':action.kind==='add_cost'?'Okej, ingen kostnad tillagd.':'Okej, åtgärden avbruten.';
  if(status==='confirmed'){try{const execute=executors[action.kind];if(!execute)throw new Error('Åtgärden stöds inte.');result=await execute(action,ctx);reply=result.reply??`Kostnad ${Number(result.amount).toLocaleString('sv-SE')} kr tillagd på ${result.address}.`;if(result.warnings.length)reply+=' '+result.warnings.join(' ');}catch(e){status='failed';error=e instanceof Error?e.message:'Åtgärden kunde inte sparas.';reply=`Åtgärden kunde inte genomföras. ${error}`;}}
 const updated=await ctx.adminClient.from('ai_actions').update({status,result,error,decided_at:new Date().toISOString()}).eq('id',action.id);if(updated.error)throw new Error(updated.error.message);
 const case_ids=result?[result.case_id]:[];
 const saved=await ctx.adminClient.from('ai_messages').insert({thread_id:action.thread_id,role:'assistant',content:reply,case_ids}).select('id').single();if(saved.error)throw new Error(saved.error.message);
 return {reply,message_id:saved.data.id,case_ids,thread_id:action.thread_id,...(status==='failed'?{error_code:'action_failed'}:{})};
}