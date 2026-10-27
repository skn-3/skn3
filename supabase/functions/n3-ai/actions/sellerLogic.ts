import { UUID } from '../logic.ts';
import { approvedHoursError } from './extraHours.ts';
export const sellerTitles:Record<string,string>={create_case:'Skapa ärende',update_case:'Ändra orderuppgifter',set_status:'Ändra status',set_extra_hours:'Ändra extra timmar',send_chat_message:'Skicka meddelande till kollega'};
export const SELLER_STATUS_LABELS:Record<string,string>={ny:'Ny',vantar_km:'Väntar KM',km_bokad:'KM bokad',km_klar:'KM klar',vantar_godkannande:'Väntar godkännande',godkand:'Godkänd',i_produktion:'I produktion',leverans_klar:'Leverans klar',montage_bokat:'Montage bokat',montage_pagar:'Montage pågår',montage_klart:'Montage klart',fakturerad:'Fakturerad',pausad:'Pausad'};
// Samma roller som har motsvarande knappar i säljarvyn (montörer har montörvyns åtgärder).
export function sellerRoleError(ctx:{role:string;isAdmin:boolean}):string|null{
 return ctx.isAdmin||ctx.role==='seller'||ctx.role==='coordinator'?null:'Åtgärden är inte tillgänglig för din roll.';
}
const str=(v:unknown,key:string,max:number,required=false)=>{
 if((v===undefined||v===null)&&!required)return null;
 if(typeof v!=='string'||v.length>max)throw new Error(`Ogiltigt värde för ${key}.`);
 const t=v.trim();if(required&&!t)throw new Error(`${key} saknas.`);
 return t||null;
};
const bool=(v:unknown,key:string)=>{if(typeof v!=='boolean')throw new Error(`Ogiltigt värde för ${key}.`);return v;};
const intOrNull=(v:unknown,key:string,min:number,max:number)=>{
 if(v===null)return null;
 if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)throw new Error(`Ogiltigt värde för ${key}.`);
 return v;
};
export interface CreateCaseInput{address:string;city:string;customer_name:string;customer_phone:string|null;customer_email:string|null;offer_number:string|null;units:number|null;notes:string|null;carry_help_needed:boolean;media_consent:boolean}
export function validateCreateCaseArgs(args:Record<string,unknown>):CreateCaseInput{
 return {
  address:str(args.address,'Adress',200,true)!,
  city:str(args.city,'Ort',200,true)!,
  customer_name:str(args.customer_name,'Kundnamn',200,true)!,
  customer_phone:str(args.customer_phone,'Telefon',50),
  customer_email:str(args.customer_email,'E-post',200),
  offer_number:str(args.offer_number,'Offertnummer',100),
  units:args.units===undefined?null:intOrNull(args.units,'Antal enheter',1,9999),
  notes:str(args.notes,'Anteckning',10000),
  carry_help_needed:args.carry_help_needed===undefined?false:bool(args.carry_help_needed,'Bärhjälp'),
  media_consent:args.media_consent===undefined?false:bool(args.media_consent,'Foto/film'),
 };
}
// Vitlista: exakt de fält säljarvyn låter rollen ändra i ärendepanelen.
export const CASE_UPDATE_FIELDS=['order_number','offer_number','delivery_week','delivery_year','delivery_date','scheduled_delivery','units','customer_phone','customer_email','customer_name','notes','carry_help_needed','media_consent','is_gotland'] as const;
export function validateCaseChanges(changes:unknown):Record<string,unknown>{
 if(!changes||typeof changes!=='object'||Array.isArray(changes))throw new Error('Ange vilka fält som ska ändras.');
 const patch:Record<string,unknown>={};
 for(const [key,value] of Object.entries(changes as Record<string,unknown>)){
  if(!(CASE_UPDATE_FIELDS as readonly string[]).includes(key))throw new Error(`Fältet ${key} kan inte ändras här.`);
  switch(key){
   case 'order_number':case 'offer_number':patch[key]=str(value,key,100);break;
   case 'customer_name':patch[key]=str(value,'Kundnamn',200,true);break;
   case 'customer_phone':patch[key]=str(value,'Telefon',50);break;
   case 'customer_email':patch[key]=str(value,'E-post',200);break;
   case 'notes':patch[key]=str(value,'Anteckning',10000);break;
   case 'delivery_week':patch[key]=intOrNull(value,'Leveransvecka',1,53);break;
   case 'delivery_year':patch[key]=intOrNull(value,'Leveransår',2020,2100);break;
   case 'units':patch[key]=intOrNull(value,'Antal enheter',0,9999);break;
   case 'scheduled_delivery':case 'carry_help_needed':case 'media_consent':case 'is_gotland':patch[key]=bool(value,key);break;
   case 'delivery_date':{
    if(value===null){patch[key]=null;break;}
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Leveransdatum ska vara YYYY-MM-DD.');
    const parsed=new Date(value+'T12:00:00Z');
    if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw new Error('Leveransdatumet finns inte.');
    patch[key]=value;break;
   }
  }
 }
 if(!Object.keys(patch).length)throw new Error('Ange minst ett fält att ändra.');
 // Samma koppling som panelen: vecka ersätter exakt datum och tvärtom.
 if(patch.delivery_week!=null){if(patch.delivery_year==null)throw new Error('Ange även leveransår.');patch.delivery_date=null;patch.delivery_time=null;}
 else if(patch.delivery_date!=null){patch.delivery_week=null;patch.delivery_year=null;}
 return patch;
}
const FIELD_LABELS:Record<string,string>={order_number:'Ordernummer',offer_number:'Offertnummer',delivery_week:'Leveransvecka',delivery_year:'Leveransår',delivery_date:'Leveransdatum',scheduled_delivery:'Tidsstyrd leverans',units:'Antal enheter',customer_phone:'Telefon',customer_email:'E-post',customer_name:'Kundnamn',notes:'Anteckning',carry_help_needed:'Bärhjälp behövs',media_consent:'Foto/film överenskommet',is_gotland:'Gotland',delivery_time:'Leveranstid'};
const fmt=(key:string,value:unknown)=>{
 if(value===null||value===undefined||value==='')return '—';
 if(typeof value==='boolean')return value?'Ja':'Nej';
 if(key==='delivery_week')return 'v.'+value;
 return String(value);
};
// Samma ändringstexter som ärendepanelens sammanfattning.
const CHANGE_TEXT:Record<string,(v:unknown)=>string>={
 order_number:v=>`Ordernummer ändrat till ${fmt('order_number',v)}`,
 offer_number:v=>`Offertnummer ändrat till ${fmt('offer_number',v)}`,
 delivery_week:(v)=>v==null?'Leveransvecka ändrat till —':'',
 delivery_date:v=>`Leveransdatum ändrat till ${fmt('delivery_date',v)}`,
 scheduled_delivery:v=>`Tidsstyrd leverans ändrat till ${fmt('scheduled_delivery',v)}`,
 units:v=>`Antal enheter satt till ${fmt('units',v)}`,
 customer_phone:()=>'Telefon uppdaterad',
 customer_email:()=>'E-post uppdaterad',
 customer_name:v=>`Kundnamn ändrat till ${fmt('customer_name',v)}`,
 notes:()=>'Anteckning uppdaterad',
 carry_help_needed:v=>`Bärhjälp behövs ändrat till ${fmt('carry_help_needed',v)}`,
 media_consent:v=>`Foto/film överenskommet ändrat till ${fmt('media_consent',v)}`,
 is_gotland:v=>`Gotland ändrat till ${fmt('is_gotland',v)}`,
 delivery_time:()=>'Leveranstid uppdaterad',
};
export function describeCaseChanges(patch:Record<string,unknown>,current:Record<string,any>):{rows:{label:string;value:string}[];texts:string[]}{
 const rows:{label:string;value:string}[]=[];const texts:string[]=[];
 for(const key of Object.keys(patch)){
  const oldV=current?.[key]??null,newV=patch[key]??null;
  if(oldV===newV)continue;
  rows.push({label:FIELD_LABELS[key]??key,value:`${fmt(key,oldV)} → ${fmt(key,newV)}`});
  if(key==='delivery_week'&&newV!=null)texts.push(`Leveransvecka ändrad till v.${newV} ${patch.delivery_year??current?.delivery_year??''}`.trim());
  else if(key==='delivery_year'){/* räknas in i veckoraden */}
  else texts.push(CHANGE_TEXT[key]?.(newV)??`${FIELD_LABELS[key]??key} uppdaterad`);
 }
 return {rows,texts};
}
const ORDER=['ny','vantar_km','km_bokad','km_klar','vantar_godkannande','godkand','leverans_klar','montage_bokat','montage_pagar','montage_klart','fakturerad'];
// Speglar canEnterStatus i appens statusRules, inklusive leveransgrinden.
export function statusGateError(newStatus:unknown,c:Record<string,any>):string|null{
 if(typeof newStatus!=='string'||!SELLER_STATUS_LABELS[newStatus])return 'Okänd status. Använd appens statusar, t.ex. Godkänd eller Montage bokat.';
 if(newStatus===c.status)return 'Ärendet har redan den statusen.';
 const target=ORDER.indexOf(newStatus),gate=ORDER.indexOf('vantar_godkannande');
 const exempt=newStatus==='montage_klart'||newStatus==='fakturerad';
 if(target>=gate&&target!==-1&&!exempt&&!c.delivery_date&&!c.delivery_week)return 'Välj leveransdatum eller leveransvecka innan ärendet förs vidare från KM klar';
 switch(newStatus){
  case 'montage_bokat':
   if(!c.team)return 'Montage-montör måste tilldelas först';
   if(!c.montage_date)return 'Montagedatum måste sättas först';
   return null;
  case 'montage_pagar':
   if(c.status!=='montage_bokat')return 'Montage måste vara bokat först';
   if(!c.team)return 'Montör saknas';
   if(!c.montage_date)return 'Montagedatum saknas';
   return null;
  case 'montage_klart':
   if(c.status!=='montage_bokat'&&c.status!=='montage_pagar')return 'Montage måste vara bokat eller pågående först';
   return null;
  case 'fakturerad':
   if(c.status!=='montage_klart')return 'Montage måste vara klart först';
   return null;
  default:return null;
 }
}
export function validateExtraHoursArgs(args:Record<string,unknown>,c:Record<string,any>):{extra_hours_approved:number}{
 if(args.requested!==undefined)throw new Error('Begärda timmar sätts av montören i appen.');
 const invalid=approvedHoursError(args.approved);
 if(invalid)throw new Error(invalid);
 if(typeof args.approved!=='number')throw new Error('Ange godkända timmar mellan 0 och 500.');
 return {extra_hours_approved:args.approved};
}
export function validateChatMessageArgs(args:Record<string,unknown>):{recipient_name:string;text:string;case_id?:string}{
 const recipient=str(args.recipient_name,'Mottagare',200,true)!;
 const text=str(args.text,'Meddelande',10000,true)!;
 if(args.case_id!==undefined&&args.case_id!==null&&(typeof args.case_id!=='string'||!UUID.test(args.case_id)))throw new Error('Ogiltigt ärende.');
 return {recipient_name:recipient,text,...(args.case_id?{case_id:String(args.case_id)}:{})};
}
export interface ProfileMatch{id:string;name:string;role:string}
// Samma källa som chattens personväljare (profiles_public), matchat på namn.
export function matchRecipient(profiles:ProfileMatch[],query:string,selfId:string):{match?:ProfileMatch;matches?:ProfileMatch[]}{
 const q=query.trim().toLowerCase();
 const candidates=profiles.filter(p=>p.id!==selfId);
 const exact=candidates.filter(p=>p.name.trim().toLowerCase()===q);
 const found=exact.length?exact:candidates.filter(p=>p.name.toLowerCase().includes(q));
 if(found.length===1)return {match:found[0]};
 if(found.length>1)return {matches:found.slice(0,5)};
 return {};
}
