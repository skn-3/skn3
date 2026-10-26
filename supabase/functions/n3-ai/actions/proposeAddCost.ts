import { visibleCase, type ToolContext } from '../tools/context.ts';
import { validateCostArgs, ownReceiptPath, formatCostAmount } from './logic.ts';
import { saveProposal } from './proposal.ts';
export interface ActionContext extends ToolContext { userClient:any; adminClient:any; userId:string; threadId:string; receiptPath?:string; proposalId?:string }
export const proposeAddCost={
 name:'propose_add_cost',description:'Föreslå en kostnad efter att ärende, belopp, beskrivning och frågan om valfritt kvitto har klarlagts. Sparar bara ett förslag, aldrig en kostnad.',
 schema:{type:'object',properties:{case_id:{type:'string'},amount:{type:'number',exclusiveMinimum:0,maximum:200000},description:{type:'string',minLength:3},receipt_path:{type:'string'}},required:['case_id','amount','description'],additionalProperties:false},
 async handler(args:Record<string,unknown>,ctx:ActionContext){
 if(ctx.proposalId)return {error:'Ett förslag har redan skapats. Be användaren bekräfta kortet.'};
 const payload=validateCostArgs(args);const found=await visibleCase(payload.case_id,ctx);if(!found)return {error:'Ärendet finns inte eller är inte synligt för dig.'};
 // A model cannot invent or reuse a receipt: only the current user-attached object is allowed.
 if(payload.receipt_path&&payload.receipt_path!==ctx.receiptPath)return {error:'Bifoga kvittot med gem-knappen först.'};
 if(ctx.receiptPath){if(!ownReceiptPath(ctx.receiptPath,ctx.userId))return {error:'Ogiltigt kvitto.'};payload.receipt_path=ctx.receiptPath;}
 payload.address=found.address;payload.city=found.city;
 const previous=await ctx.adminClient.from('ai_actions').select('id,payload,status,created_at').eq('thread_id',ctx.threadId).order('created_at',{ascending:false}).limit(1).maybeSingle();if(previous.error)throw new Error(previous.error.message);
 if(previous.data&&previous.data.payload.case_id===payload.case_id&&previous.data.payload.amount===payload.amount&&previous.data.payload.description===payload.description)return {error:'Samma kostnad har redan föreslagits. Använd det befintliga kortet.'};
 const summary=`Kostnad ${formatCostAmount(payload.amount)} kr, ${payload.description}, ${found.address}`;
  return {...await saveProposal('add_cost',{...payload,customer_name:found.customer_name,status:found.status},'Lägg till kostnad',[{label:'Ärende',value:[found.address,found.city].filter(Boolean).join(', ')},{label:'Belopp',value:formatCostAmount(payload.amount)+' kr ex moms'},{label:'Beskrivning',value:payload.description}],ctx),summary};
 }
};