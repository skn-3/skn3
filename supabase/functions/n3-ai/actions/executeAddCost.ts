import { visibleCase } from '../tools/context.ts';
import { validateCostArgs, ownReceiptPath, formatCostAmount } from './logic.ts';
import type { ActionContext } from './proposeAddCost.ts';
export async function executeAddCost(action:any,ctx:ActionContext){
 const payload=validateCostArgs(action.payload);const found=await visibleCase(payload.case_id,ctx);if(!found)throw new Error('Ärendet är inte längre synligt för dig.');
 if(payload.receipt_path&&!ownReceiptPath(payload.receipt_path,ctx.userId))throw new Error('Ogiltigt kvitto.');
 const cost={id:action.id,case_id:payload.case_id,amount:payload.amount,description:payload.description,created_by:ctx.name,category:'ovrigt',responsible:null,receipt_path:payload.receipt_path??null};
 const {data,error}=await ctx.userClient.from('case_costs').insert(cost).select('id').single();if(error)throw new Error(error.message);
 const warnings:string[]=[];
 // The primary cost is saved. Event/log errors must never invite a duplicate retry.
 try{const event=await ctx.userClient.from('case_events').insert({case_id:payload.case_id,event_type:'cost',description:`Kostnad tillagd: ${payload.description} — ${formatCostAmount(payload.amount)} kr ex moms via N3prenad-AI`,created_by:ctx.name});if(event.error)warnings.push('Historiken kunde inte uppdateras.');}catch{warnings.push('Historiken kunde inte uppdateras.');}
 try{const log=await ctx.userClient.from('activity_log').insert({actor_name:ctx.name,actor_role:ctx.role,action:'cost_added',category:'case',description:`Registrerade kostnad (${formatCostAmount(payload.amount)} kr) för ${found.address} via N3prenad-AI`,case_id:payload.case_id,metadata:{amount:payload.amount,description:payload.description,has_receipt:!!payload.receipt_path,receipt_failed:false,category:'ovrigt',responsible:null,via:'N3prenad-AI'}});if(log.error)warnings.push('Aktivitetsloggen kunde inte uppdateras.');}catch{warnings.push('Aktivitetsloggen kunde inte uppdateras.');}
 return {cost_id:data.id,case_id:payload.case_id,address:found.address,amount:payload.amount,warnings};
}