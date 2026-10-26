import { stockholmDate, UUID } from '../logic.ts';
export const titles:Record<string,string>={report_problem:'Rapportera problem',add_note:'Lägg till anteckning',partial_report:'Delrapportera montage',complete_montage:'Montage klart',start_montage:'Påbörja montage',book_km:'Boka kontrollmätning',book_montage:'Boka montage',reschedule_montage:'Boka om montage'};
export function validateBooking(date:unknown,time:unknown,now=new Date()) {
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Datum ska vara YYYY-MM-DD.');
 const instant=new Date(date+'T12:00:00Z');if(!Number.isFinite(instant.getTime())||instant.toISOString().slice(0,10)!==date)throw new Error('Ogiltigt datum.');
 const days=(instant.getTime()-new Date(stockholmDate(now)+'T12:00:00Z').getTime())/86400000;
 if(days<0||days>365)throw new Error('Datum får inte vara passerat eller mer än 365 dagar framåt.');
 if(time!==undefined&&(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))throw new Error('Tid ska vara HH:MM.');
 return {date,time:time as string|undefined};
}
export function bookingLabel(date:string,time?:string){return new Intl.DateTimeFormat('sv-SE',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))+(time?' kl '+time:'');}
export function validateInstallerArgs(kind:string,args:Record<string,unknown>,now=new Date()){
 if(typeof args.case_id!=='string'||!UUID.test(args.case_id))throw new Error('Välj ett giltigt ärende.');
 const payload:Record<string,any>={case_id:args.case_id};
 const required=kind==='report_problem'?'description':kind==='add_note'?'text':kind==='partial_report'?'remaining':null;
 if(required){const value=args[required];if(typeof value!=='string'||!value.trim()||value.length>10000)throw new Error('Beskriv vad som ska rapporteras.');payload[required]=value.trim();}
 for(const key of ['comment','reason'])if(args[key]!==undefined){if(typeof args[key]!=='string'||args[key].length>10000)throw new Error('Ogiltig kommentar.');payload[key]=args[key].trim();}
 if(kind.includes('book_')||kind==='reschedule_montage')Object.assign(payload,validateBooking(args.date,args.time,now));
 if(args.photo_path!==undefined){if(typeof args.photo_path!=='string'||args.photo_path.length>512)throw new Error('Ogiltig bild.');payload.photo_path=args.photo_path;}
 return payload;
}
export function installerActionError(kind:string,c:any,ctx:{role:string;name:string;isAdmin:boolean},payload:any):string|null{
 if(ctx.role!=='montor'&&!ctx.isAdmin)return 'Åtgärden är endast tillgänglig för montörer och admin i montörvyn.';
 if(ctx.role==='montor'&&!ctx.isAdmin){const assigned=['report_problem','add_note','book_km'].includes(kind)?(c.km_team===ctx.name||c.team===ctx.name):c.team===ctx.name;
 if(!assigned&&!(kind==='book_montage'&&!c.team))return 'Åtgärden hör till ett annat montörsteam.';}
 if(kind==='book_km'&&c.status!=='vantar_km')return 'KM kan bara bokas när ärendet väntar på KM.';
 if(kind==='book_montage'&&(!['godkand','i_produktion','leverans_klar'].includes(c.status)||c.montage_date))return 'Montage kan inte bokas i nuvarande status.';
 if(kind==='reschedule_montage'&&(!c.montage_date||['montage_klart','fakturerad'].includes(c.status)))return 'Montaget kan inte bokas om i nuvarande status.';
 if(kind==='start_montage'&&c.status!=='montage_bokat')return 'Montage måste vara bokat först.';
 if(['partial_report','complete_montage'].includes(kind)&&!['montage_bokat','montage_pagar'].includes(c.status))return 'Montage måste vara bokat eller pågående först.';
 if(kind==='book_montage'||kind==='start_montage'||kind==='partial_report'&&c.status==='montage_bokat'){
 if(!c.delivery_date&&!c.delivery_week)return 'Välj leveransdatum eller leveransvecka innan ärendet förs vidare från KM klar';
 if(kind!=='book_montage'&&(!c.team||!c.montage_date))return 'Montör och montagedatum måste vara angivna.';
 if(kind==='book_montage'&&!c.team&&ctx.role!=='montor')return 'Montage-montör måste tilldelas först';
 }
 return null;
}
