import { cases,ownScope,checkedId } from '../tools/context.ts';
import type { ActionContext } from './proposeAddCost.ts';
import { validateInstallerArgs,installerActionError,titles,bookingLabel } from './installerLogic.ts';
import { ownReceiptPath } from './logic.ts';
import { saveProposal } from './proposal.ts';
export async function installerCase(id:string,ctx:ActionContext){const {data,error}=await ownScope(cases(ctx).select('id,address,city,customer_name,customer_phone,status,team,km_team,seller,km_date,km_time,montage_date,montage_time,delivery_date,delivery_week'),ctx).eq('id',id).maybeSingle();if(error)throw new Error(error.message);if(!data)throw new Error('Ärendet är inte synligt för dig.');ctx.seenCaseIds.add(id);return data;}
export function installerProposal(kind:string,properties:Record<string,unknown>,required:string[]=[]){return {
 name:'propose_'+kind,description:titles[kind]+'. Samla först in saknade uppgifter; sparar endast ett förslag för uttrycklig bekräftelse.',
 schema:{type:'object',properties:{case_id:{type:'string'},...properties},required:['case_id',...required],additionalProperties:false},
 async handler(args:Record<string,unknown>,ctx:ActionContext){try{
 if(ctx.proposalId)return {error:'Bekräfta eller avbryt det nya kortet först.'};
 const payload=validateInstallerArgs(kind,args,ctx.now);const c=await installerCase(checkedId(args),ctx);const error=installerActionError(kind,c,ctx,payload);if(error)return {error};
 if(kind==='book_montage'&&!c.team&&ctx.role==='montor'){const team=await ctx.userClient.from('montor_teams').select('id').eq('name',ctx.name).maybeSingle();if(team.error||!team.data)return {error:'Montage-montör måste tilldelas först.'};}
 if(kind==='report_problem'){
 if(payload.photo_path&&payload.photo_path!==ctx.receiptPath)return {error:'Bifoga bilden med gem-knappen först.'};
 if(ctx.receiptPath){if(!ownReceiptPath(ctx.receiptPath,ctx.userId))return {error:'Ogiltig bild.'};payload.photo_path=ctx.receiptPath;}
 }
 Object.assign(payload,{address:c.address,city:c.city,customer_name:c.customer_name,status:c.status});
 const rows=[{label:'Ärende',value:[c.address,c.city].filter(Boolean).join(', ')}];
 if(payload.date)rows.push({label:'Datum',value:bookingLabel(payload.date,payload.time)});
 for(const [key,label] of [['description','Beskrivning'],['text','Anteckning'],['remaining','Allt är klart utom'],['comment','Slutkommentar'],['reason','Anledning']])if(payload[key])rows.push({label,value:payload[key]});
 if(kind==='report_problem'){rows.push({label:'Typ',value:'Övrigt'},{label:'Ansvar',value:'Okänt'},{label:'Prioritet',value:'Medium'});}
 return await saveProposal(kind,payload,titles[kind],rows,ctx);
 }catch(e){return {error:e instanceof Error?e.message:'Förslaget kunde inte skapas.'};}}
};}
