import { UUID } from '../logic.ts';
export const ACTION_TTL_MS = 15 * 60 * 1000;
export interface CostPayload { case_id:string; amount:number; description:string; receipt_path?:string; address?:string; city?:string|null }
export function validateCostArgs(args:Record<string,unknown>):CostPayload {
 if(typeof args.case_id!=='string'||!UUID.test(args.case_id))throw new Error('Välj ett giltigt ärende.');
 if(typeof args.amount!=='number'||!Number.isFinite(args.amount)||args.amount<=0||args.amount>200000)throw new Error('Beloppet måste vara över 0 och högst 200 000 kr.');
 if(typeof args.description!=='string'||args.description.trim().length<3||args.description.length>10000)throw new Error('Beskriv kostnaden med minst 3 tecken.');
 if(args.receipt_path!==undefined&&(typeof args.receipt_path!=='string'||args.receipt_path.length>512))throw new Error('Ogiltigt kvitto.');
 return {case_id:args.case_id,amount:args.amount,description:args.description.trim(),...(args.receipt_path?{receipt_path:String(args.receipt_path)}:{})};
}
export function actionDecisionError(action:{status:string;created_at:string;decided_at?:string|null},now=new Date()):string|null {
 if(action.status!=='pending'||action.decided_at)return 'Förslaget är redan beslutat eller behandlas.';
 const created=Date.parse(action.created_at);
 return !Number.isFinite(created)||now.getTime()-created>=ACTION_TTL_MS?'Förslaget har gått ut.':null;
}
export function ownReceiptPath(path:string,userId:string):boolean {
 return new RegExp(`^${userId}/[0-9a-f-]+\\.(jpg|jpeg|png|webp)$`,'i').test(path);
}
export const formatCostAmount=(amount:number)=>amount.toLocaleString('sv-SE');