import type { ActionContext } from './proposeAddCost.ts';
export async function saveProposal(kind:string,payload:Record<string,unknown>,title:string,rows:{label:string;value:string}[],ctx:ActionContext){
 const saved=await ctx.adminClient.rpc('ai_create_proposal',{p_user_id:ctx.userId,p_thread_id:ctx.threadId,p_kind:kind,p_payload:{...payload,title,rows},p_summary:title+': '+rows.map(r=>r.value).join(', ')});
 if(saved.error)throw new Error(saved.error.message);ctx.proposalId=saved.data;
 return {proposal_id:saved.data,needs_confirmation:true,case_id:payload.case_id,address:payload.address,city:payload.city,customer_name:payload.customer_name,status:payload.status};
}
