import type { ActionContext } from './proposeAddCost.ts';
import { sellerCase } from './proposeSeller.ts';
import { validateCreateCaseArgs, validateCaseChanges, describeCaseChanges, statusGateError, SELLER_STATUS_LABELS, validateExtraHoursArgs, validateChatMessageArgs, matchRecipient } from './sellerLogic.ts';
import { sendActionEmail, COORDINATOR_EMAIL, teamEmails } from './email.ts';
const via=' via N3prenad-AI';
export async function executeSeller(action:any,ctx:ActionContext){
 const kind=action.kind;
 const warnings:string[]=[];
 const required=async(q:any)=>{const result=await q;if(result.error)throw new Error(result.error.message);return result.data;};
 const later=async(label:string,fn:()=>Promise<unknown>)=>{try{await fn();}catch{warnings.push(label);}};
 const activity=async(actionName:string,description:string,metadata:any,caseId:string|null)=>later('Aktivitetsloggen kunde inte uppdateras.',()=>required(ctx.userClient.from('activity_log').insert({actor_name:ctx.name,actor_role:ctx.role,action:actionName,category:'case',description:description+via,case_id:caseId,metadata:{...metadata,via:'N3prenad-AI'}})));
 if(kind==='create_case'){
  const input=validateCreateCaseArgs(action.payload);
  const created=await required(ctx.userClient.from('cases').insert({
   address:input.address,city:input.city,customer_name:input.customer_name,
   customer_phone:input.customer_phone??'',customer_email:input.customer_email,offer_number:input.offer_number,
   units:input.units,notes:input.notes,carry_help_needed:input.carry_help_needed,media_consent:input.media_consent,
   seller:ctx.name,status:'vantar_km',extra_hours_sold:0,
  }).select('id').single());
  await later('Historiken kunde inte uppdateras.',()=>required(ctx.userClient.from('case_events').insert({case_id:created.id,event_type:'status_change',description:'Ärende skapat'+via,created_by:ctx.name})));
  await activity('case_created',`Skapade ärende för ${input.address}`,{address:input.address,city:input.city},created.id);
  return {case_id:created.id,address:input.address,warnings,reply:`Ärende skapat på ${input.address}.`};
 }
 if(kind==='send_chat_message'){
  const input=validateChatMessageArgs(action.payload);
  if(input.case_id){const c=await sellerCase(input.case_id,ctx);if(!c)throw new Error('Ärendet är inte längre synligt för dig.');}
  const {data:profiles,error}=await ctx.userClient.from('profiles_public').select('id,name,role');
  if(error)throw new Error(error.message);
  const found=matchRecipient(profiles??[],input.recipient_name,ctx.userId);
  if(!found.match||found.match.id!==action.payload.recipient_id)throw new Error('Mottagaren matchar inte längre. Be om ett nytt förslag.');
  const conversation=await ctx.userClient.rpc('start_conversation',{p_user_ids:[found.match.id],p_title:null});
  if(conversation.error)throw new Error(conversation.error.message);
  await required(ctx.userClient.from('messages').insert({conversation_id:conversation.data,sender_id:ctx.userId,body:input.text,case_id:input.case_id??null,attachments:[]}));
  return {case_id:input.case_id??null,address:action.payload.address??null,warnings,reply:`Meddelande skickat till ${found.match.name}.`};
 }
 const c=await sellerCase(String(action.payload.case_id),ctx);
 const event=async(type:string,description:string)=>required(ctx.userClient.from('case_events').insert({case_id:c.id,event_type:type,description:description+via,created_by:ctx.name}));
 if(kind==='update_case'){
  const patch=validateCaseChanges(action.payload.changes);
  const {texts}=describeCaseChanges(patch,c);
  if(!texts.length)throw new Error('Ingen av ändringarna skiljer sig längre från nuvarande värden.');
  const changed=await required(ctx.userClient.from('cases').update(patch).eq('id',c.id).select('id'));
  if(!changed?.length)throw new Error('Ärendet kunde inte uppdateras.');
  await later('Historiken kunde inte uppdateras.',()=>event('update',texts.join(', ')));
  await activity('case_updated',`Uppdaterade ärendedata för ${c.address}`,{changes:patch},c.id);
  return {case_id:c.id,address:c.address,warnings,reply:`Orderuppgifter uppdaterade på ${c.address}.`};
 }
 if(kind==='set_status'){
  const newStatus=String(action.payload.status);
  const blocked=statusGateError(newStatus,c);if(blocked)throw new Error(blocked);
  const changed=await required(ctx.userClient.from('cases').update({status:newStatus}).eq('id',c.id).eq('status',c.status).select('id'));
  if(!changed?.length)throw new Error('Ärendet har ändrats. Be om ett nytt förslag.');
  const label=SELLER_STATUS_LABELS[newStatus]??newStatus;
  await later('Historiken kunde inte uppdateras.',()=>event('status_change',`Status ändrad till: ${label}`));
  // Samma aktivitetsloggning som statusknappen.
  if(newStatus==='montage_bokat')await activity('montage_booked',`Bokade montage för ${c.address}`,{from:c.status,to:newStatus,montage_date:c.montage_date},c.id);
  else if(newStatus==='montage_klart')await activity('montage_completed',`Markerade montage klart för ${c.address}`,{from:c.status,to:newStatus},c.id);
  else if(!['km_bokad','montage_pagar'].includes(newStatus))await activity('status_changed',`Ändrade status till ${label} för ${c.address}`,{from:c.status,to:newStatus},c.id);
  // Samma mejl som statusknappen vid montage bokat: koordinator + tilldelad montör.
  if(newStatus==='montage_bokat'){
   const rows=[{label:'Adress',value:c.address},{label:'Kund',value:c.customer_name},{label:'Montör',value:c.team||'Ej tilldelad'},{label:'Montagedatum',value:c.montage_date||'Ej angivet'},...(c.notes?[{label:'Anteckning',value:c.notes}]:[])];
   const mails=[{to:COORDINATOR_EMAIL,subject:`MONTAGE BOKAT — ${c.address}`,heading:'Montage bokat',rows}];
   const teamMail=c.team?teamEmails[c.team]:undefined;
   if(teamMail)mails.push({to:teamMail,subject:`MONTAGE TILLDELAT — ${c.address}`,heading:'Du har blivit tilldelad ett montage',rows:[...rows,{label:'Telefon',value:c.customer_phone||'Ej angivet'}]});
   for(const mail of mails)await later('Statusen är ändrad men ett mejl kunde inte skickas.',async()=>{await sendActionEmail(mail);await event('notification',`Mail skickat till ${mail.to} (${mail.heading})`);});
  }
  return {case_id:c.id,address:c.address,warnings,reply:`Status ändrad till ${label} på ${c.address}.`};
 }
 if(kind==='set_extra_hours'){
  const patch=validateExtraHoursArgs(action.payload,c);
  const old=Number(c.extra_hours_approved??0);
  const changed=await required(ctx.userClient.from('cases').update(patch).eq('id',c.id).select('id'));
  if(!changed?.length)throw new Error('Ärendet kunde inte uppdateras.');
  await later('Historiken kunde inte uppdateras.',()=>event('hours_adjusted',`Extra tim godkända ändrade från ${old} till ${patch.extra_hours_approved} (av ${ctx.name})`));
  await activity('hours_adjusted',`Extra tim godkända: ${old} → ${patch.extra_hours_approved}`,{field:'extra_hours_approved',oldValue:old,newValue:patch.extra_hours_approved,case_id:c.id},c.id);
  return {case_id:c.id,address:c.address,warnings,reply:`Godkända extra timmar ändrade till ${patch.extra_hours_approved} på ${c.address}.`};
 }
 throw new Error('Åtgärden stöds inte.');
}
