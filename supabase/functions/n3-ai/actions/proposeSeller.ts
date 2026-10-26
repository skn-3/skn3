import { cases, ownScope, checkedId, visibleCase } from '../tools/context.ts';
import type { ActionContext } from './proposeAddCost.ts';
import { sellerTitles, sellerRoleError, validateCreateCaseArgs, validateCaseChanges, describeCaseChanges, statusGateError, SELLER_STATUS_LABELS, validateExtraHoursArgs, validateChatMessageArgs, matchRecipient } from './sellerLogic.ts';
import { saveProposal } from './proposal.ts';
const SELLER_CASE_FIELDS='id,address,city,customer_name,status,team,seller,montage_date,delivery_date,delivery_time,delivery_week,delivery_year,order_number,offer_number,units,customer_phone,customer_email,notes,carry_help_needed,media_consent,is_gotland,scheduled_delivery,extra_hours_requested,extra_hours_approved';
export async function sellerCase(id:string,ctx:ActionContext){
 const {data,error}=await ownScope(cases(ctx).select(SELLER_CASE_FIELDS),ctx).eq('id',id).maybeSingle();
 if(error)throw new Error(error.message);
 if(!data)throw new Error('Ärendet är inte synligt för dig.');
 ctx.seenCaseIds.add(id);
 return data;
}
const caseRow=(c:any)=>({label:'Ärende',value:[c.address,c.city].filter(Boolean).join(', ')});
function tool(name:string,description:string,properties:Record<string,unknown>,required:string[],handler:(args:Record<string,unknown>,ctx:ActionContext)=>Promise<unknown>,anyRole=false){
 return {name,description,schema:{type:'object',properties,required,additionalProperties:false},
  async handler(args:Record<string,unknown>,ctx:ActionContext){try{
   if(ctx.proposalId)return {error:'Bekräfta eller avbryt det nya kortet först.'};
   if(!anyRole){const roleError=sellerRoleError(ctx);if(roleError)return {error:roleError};}
   return await handler(args,ctx);
   }catch(e){return {error:e instanceof Error?e.message:'Förslaget kunde inte skapas.'};}}};
}
export const proposeCreateCase=tool('propose_create_case','Föreslå ett nytt ärende efter att adress, ort och kundnamn klarlagts. Fråga efter det som saknas först; sparar endast ett förslag för uttrycklig bekräftelse.',
 {address:{type:'string'},city:{type:'string'},customer_name:{type:'string'},customer_phone:{type:'string'},customer_email:{type:'string'},offer_number:{type:'string'},units:{type:'integer'},notes:{type:'string'},carry_help_needed:{type:'boolean'},media_consent:{type:'boolean'}},
 ['address','city','customer_name'],
 async(args,ctx)=>{
  const input=validateCreateCaseArgs(args);
  const {data:dups,error}=await ctx.userClient.from('cases').select('id,address,status').ilike('address',input.address.replace(/[%_\\]/g,m=>'\\'+m)).limit(3);
  if(error)throw new Error(error.message);
  const rows=[{label:'Adress',value:[input.address,input.city].join(', ')},{label:'Kund',value:input.customer_name}];
  if(input.customer_phone)rows.push({label:'Telefon',value:input.customer_phone});
  if(input.customer_email)rows.push({label:'E-post',value:input.customer_email});
  if(input.offer_number)rows.push({label:'Offertnummer',value:input.offer_number});
  if(input.units!=null)rows.push({label:'Antal enheter',value:String(input.units)});
  if(input.notes)rows.push({label:'Anteckning',value:input.notes});
  rows.push({label:'Bärhjälp',value:input.carry_help_needed?'Ja':'Nej'},{label:'Foto/film',value:input.media_consent?'Ja':'Nej'},{label:'Säljare',value:ctx.name});
  if(dups?.length)rows.push({label:'Varning',value:'Det finns redan ett ärende på den här adressen. Bekräfta bara om det verkligen är ett nytt ärende.'});
  return await saveProposal('create_case',{...input,status:'vantar_km'},sellerTitles.create_case,rows,ctx);
 });
export const proposeUpdateCase=tool('propose_update_case','Föreslå ändring av orderuppgifter på ett ärende (ordernummer, offertnummer, leverans, enheter, kunduppgifter, anteckning, bärhjälp, foto/film, Gotland). Sparar endast ett förslag för uttrycklig bekräftelse.',
 {case_id:{type:'string'},changes:{type:'object'}},
 ['case_id','changes'],
 async(args,ctx)=>{
  const patch=validateCaseChanges(args.changes);
  const c=await sellerCase(checkedId(args),ctx);
  const {rows,texts}=describeCaseChanges(patch,c);
  if(!rows.length)return {error:'Ingen av ändringarna skiljer sig från nuvarande värden.'};
  const payload={case_id:c.id,changes:patch,address:c.address,city:c.city,customer_name:c.customer_name,status:c.status,current:Object.fromEntries(Object.keys(patch).map(k=>[k,(c as any)[k]??null]))};
  const saved=await saveProposal('update_case',payload,sellerTitles.update_case,[caseRow(c),...rows],ctx);
  return {...saved,summary:'Ändringar: '+texts.join(', ')};
 });
export const proposeSetStatus=tool('propose_set_status','Föreslå en statusändring på ett ärende. Bara övergångar som är tillåtna från nuvarande status. Använd statusarnas engelska nycklar (t.ex. godkand, montage_bokat) i verktygsanropet men den svenska etiketten i texten. Sparar endast ett förslag för uttrycklig bekräftelse.',
 {case_id:{type:'string'},status:{type:'string',enum:Object.keys(SELLER_STATUS_LABELS)}},
 ['case_id','status'],
 async(args,ctx)=>{
  const c=await sellerCase(checkedId(args),ctx);
  const blocked=statusGateError(args.status,c);if(blocked)return {error:blocked};
  const from=SELLER_STATUS_LABELS[c.status]??c.status,to=SELLER_STATUS_LABELS[String(args.status)];
  return await saveProposal('set_status',{case_id:c.id,status:String(args.status),address:c.address,city:c.city,customer_name:c.customer_name,current_status:c.status},sellerTitles.set_status,[caseRow(c),{label:'Status',value:`${from} → ${to}`}],ctx);
 });
export const proposeSetExtraHours=tool('propose_set_extra_hours','Föreslå ändrade godkända extra timmar på ett ärende. Godkända kan inte överstiga begärda. Begärda timmar sätts av montören i appen och kan inte ändras här. Sparar endast ett förslag för uttrycklig bekräftelse.',
 {case_id:{type:'string'},requested:{type:'integer'},approved:{type:'integer'}},
 ['case_id'],
 async(args,ctx)=>{
  if(ctx.role==='coordinator'&&!ctx.isAdmin)return {error:'Extra timmar ändras av säljare eller admin.'};
  const c=await sellerCase(checkedId(args),ctx);
  const patch=validateExtraHoursArgs(args,c);
  const old=Number(c.extra_hours_approved??0);
  if(patch.extra_hours_approved===old)return {error:'Antalet är redan '+old+'.'};
  return await saveProposal('set_extra_hours',{case_id:c.id,...patch,address:c.address,city:c.city,customer_name:c.customer_name,status:c.status,current_approved:old,requested:Number(c.extra_hours_requested??0)},sellerTitles.set_extra_hours,[caseRow(c),{label:'Godkända extra timmar',value:`${old} → ${patch.extra_hours_approved} (begärda ${Number(c.extra_hours_requested??0)})`}],ctx);
 });
export const proposeSendChatMessage=tool('propose_send_chat_message','Föreslå ett chattmeddelande till en kollega, bara när användaren uttryckligen ber dig skicka något till någon. Vid flera namnträffar: fråga vem som avses. Sparar endast ett förslag för uttrycklig bekräftelse; kvittensen i tråden skickar inget ytterligare.',
 {recipient_name:{type:'string'},text:{type:'string'},case_id:{type:'string'}},
 ['recipient_name','text'],
 async(args,ctx)=>{
  const input=validateChatMessageArgs(args);
  const {data:profiles,error}=await ctx.userClient.from('profiles_public').select('id,name,role');
  if(error)throw new Error(error.message);
  const found=matchRecipient(profiles??[],input.recipient_name,ctx.userId);
  if(found.matches)return {error:'Flera användare matchar: '+found.matches.map(p=>p.name).join(', ')+'. Vem avses?'};
  if(!found.match)return {error:'Hittar ingen användare som heter '+input.recipient_name+'.'};
  let c:any=null;
  if(input.case_id){c=await visibleCase(input.case_id,ctx);if(!c)return {error:'Ärendet är inte synligt för dig.'};}
  const rows=[{label:'Mottagare',value:found.match.name},{label:'Meddelande',value:input.text}];
  if(c)rows.push(caseRow(c));
  return await saveProposal('send_chat_message',{recipient_id:found.match.id,recipient_name:found.match.name,text:input.text,...(c?{case_id:c.id,address:c.address,city:c.city,customer_name:c.customer_name,status:c.status}:{})},sellerTitles.send_chat_message,rows,ctx);
 },true);
