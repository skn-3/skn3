import type { ActionContext } from './proposeAddCost.ts';
import { installerCase } from './installerProposal.ts';
import { validateInstallerArgs,installerActionError,titles,bookingLabel } from './installerLogic.ts';
import { ownReceiptPath } from './logic.ts';
import { actionEmail,sendActionEmail } from './email.ts';
const via=' via N3prenad-AI';
export async function executeInstaller(action:any,ctx:ActionContext){
 const kind=action.kind,p=validateInstallerArgs(kind,action.payload,ctx.now),c=await installerCase(p.case_id,ctx);
 const blocked=installerActionError(kind,c,ctx,p);if(blocked)throw new Error(blocked);
 const warnings:string[]=[];
 const required=async(q:any)=>{const result=await q;if(result.error)throw new Error(result.error.message);return result.data;};
 const later=async(label:string,fn:()=>Promise<unknown>)=>{try{await fn();}catch{warnings.push(label);}};
 const event=async(type:string,description:string,extra:Record<string,unknown>={})=>required(ctx.userClient.from('case_events').insert({case_id:c.id,event_type:type,description:description+via,created_by:ctx.name,...extra}));
 const activity=async(actionName:string,description:string,metadata:any,extra:any={})=>later('Aktivitetsloggen kunde inte uppdateras.',()=>required(ctx.userClient.from('activity_log').insert({actor_name:ctx.name,actor_role:ctx.role,action:actionName,category:kind==='report_problem'?'deviation':'case',description:description+via,case_id:c.id,metadata:{...metadata,via:'N3prenad-AI'},...extra})));
 let reused=false;
 if(kind==='report_problem'){
 if(p.photo_path&&!ownReceiptPath(p.photo_path,ctx.userId))throw new Error('Ogiltig bild.');
 const recent=await required(ctx.userClient.from('deviations').select('id,description,image_urls').eq('case_id',c.id).eq('created_by',ctx.name).gte('created_at',new Date(ctx.now.getTime()-15*60000).toISOString()).order('created_at',{ascending:false}).limit(20));
 const normalize=(s:string)=>s.trim().replace(/\s+/g,' ').toLowerCase();
 const existing=recent?.find((d:any)=>normalize(d.description)===normalize(p.description));const id=existing?.id??action.id;reused=!!existing;
 if(!reused){await required(ctx.userClient.from('deviations').insert({id,case_id:c.id,type:'ovrigt',description:p.description,responsible:'okant',created_by:ctx.name,priority:'medium',cost:null,title:p.description.split('\n')[0].replace(/\s+/g,' ').slice(0,80),action_log:[{at:ctx.now.toISOString(),by:ctx.name,action:'Rapporterad'+via}]}));
 await later('Historiken kunde inte uppdateras.',()=>event('deviation',`Avvikelse skapad: Övrigt — ${p.description}`,{deviation_id:id}));
 await activity('deviation_created',`Avvikelse skapad: Övrigt — ${p.description.slice(0,80)}`,{type:'ovrigt',responsible:'okant',priority:'medium',cost:0},{deviation_id:id});}
 const warningCount=warnings.length;
 if(p.photo_path)await later('Problemet är rapporterat men bilden kunde inte laddas upp.',async()=>{
 const downloaded=await ctx.userClient.storage.from('ai-receipts').download(p.photo_path);if(downloaded.error||!downloaded.data)throw new Error('Bild saknas');
 const path=`${c.id}/${id}/${action.id}.jpg`;await required(ctx.userClient.storage.from('case-images').upload(path,downloaded.data,{contentType:'image/jpeg',upsert:false}));
 await required(ctx.userClient.from('deviations').update({image_urls:[...(existing?.image_urls??[]),path]}).eq('id',id));});
 if(warnings.length>warningCount){await later('Historiken kunde inte uppdateras.',()=>event('note','Bilderna till avvikelsen kunde inte laddas upp (1 st)',{deviation_id:id}));await activity('deviation_images_failed','Bilduppladdning misslyckades för avvikelse (1 st)',{files:1},{deviation_id:id});}
 }else if(kind==='add_note'){
 await event('note',`Anteckning: ${p.text}`,{id:action.id});await activity('note_added',`La till anteckning på ${c.address}`,{note:p.text});
 }else {
 const patch:Record<string,unknown>={};let type='status_change',description='',actionName='',metadata:any={};
 if(kind==='partial_report'){Object.assign(patch,{montage_partial_note:p.remaining,montage_partial_at:ctx.now.toISOString(),...(c.status==='montage_bokat'?{status:'montage_pagar'}:{})});type='montage_delrapport';description='Montage delrapporterat. Allt är klart utom: '+p.remaining;actionName='montage_partial_reported';metadata={note:p.remaining};}
 if(kind==='complete_montage'){patch.status='montage_klart';description='Montage klart.'+(p.comment?' '+p.comment:'');actionName='montage_completed';metadata={comment:p.comment||null};}
 if(kind==='start_montage'){patch.status='montage_pagar';description='Montage påbörjat';actionName='montage_started';}
 if(kind==='book_km'){Object.assign(patch,{status:'km_bokad',km_date:p.date,...(p.time?{km_time:p.time}:{})});description='KM bokad: '+p.date+(p.time?' '+p.time:'');actionName='km_booked';metadata={km_date:p.date};}
 if(kind==='book_montage'){const selfAssign=!c.team&&ctx.role==='montor';Object.assign(patch,{status:'montage_bokat',montage_date:p.date,montage_time:p.time||null,...(selfAssign?{team:ctx.name}:{})});type='montage_booked';description=`Montage bokat ${p.date}${p.time?' '+p.time:''} av ${ctx.name}${selfAssign?'. Montage-montör: '+ctx.name:''}`;actionName=type;metadata={montage_date:p.date,montage_time:p.time||null,case_id:c.id};}
 if(kind==='reschedule_montage'){Object.assign(patch,{montage_date:p.date,montage_time:p.time||null});type='montage_rescheduled';description=`Montagedatum ändrat från ${c.montage_date}${c.montage_time?' '+c.montage_time:''} till ${p.date}${p.time?' '+p.time:''} av ${ctx.name}${p.reason?'. '+p.reason:''}`;actionName=type;metadata={old_date:c.montage_date,new_date:p.date,old_time:c.montage_time||null,new_time:p.time||null,case_id:c.id};}
 // Compare the status/date read for confirmation: never silently overwrite a concurrent booking.
 let update=ctx.userClient.from('cases').update(patch).eq('id',c.id).eq('status',c.status);update=c.montage_date?update.eq('montage_date',c.montage_date):update.is('montage_date',null);
 const changed=await required(update.select('id'));if(!changed?.length)throw new Error('Ärendet har ändrats. Be om ett nytt förslag.');
 await later('Historiken kunde inte uppdateras.',()=>event(type,description));await activity(actionName,description||titles[kind],metadata);Object.assign(c,patch);
 }
 const mail=actionEmail(kind,c,ctx.name,p);
 if(mail&&(!reused||warnings.length))await later('Åtgärden är sparad men mejlet kunde inte skickas.',async()=>{if(kind==='report_problem'&&warnings.length)mail.rows.push({label:'Bilder',value:'Bilden kunde inte laddas upp — be montören skicka den på annat sätt.'});await sendActionEmail(mail);await event('notification',kind==='book_km'||kind==='book_montage'?`Tilldelningsmail skickat till montör (${mail.to})`:`Mail skickat till ${mail.to} (${titles[kind]})`);});
 const receipt=kind==='partial_report'?'Delrapport skickad':kind==='complete_montage'?'Montage markerat som klart':kind==='start_montage'?'Montage påbörjat':kind==='report_problem'?'Problem rapporterat':kind==='add_note'?'Anteckning sparad':`${titles[kind]}: ${bookingLabel(p.date,p.time)}`;
 return {case_id:c.id,address:c.address,warnings,reply:`${receipt} på ${c.address}.`};
}
