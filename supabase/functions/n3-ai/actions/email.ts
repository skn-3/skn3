// Fixed recipients only: never allow model-supplied recipients or raw HTML.
const coordinator='mirna.malke@mockfjards.se';
const teamEmails:Record<string,string>={'GVMO':'gvmo.bygg@gmail.com','Samy':'info@smtmbygg.se','Alex NBD':'alex@nbdentreprenad.com','Jerk':'jerk.ryttman@mockfjards.se','Villaspecialisten':'Edvin@villaspecialisten.se'};
export function actionEmail(kind:string,c:any,name:string,p:any){
 const rows=[{label:'Adress',value:c.address},{label:'Kund',value:c.customer_name},{label:'Montör',value:name}];
 if(kind==='partial_report')return {to:coordinator,subject:`MONTAGE DELRAPPORTERAT — ${c.address}`,heading:'Montage delrapporterat',rows:[...rows,{label:'Allt är klart utom',value:p.remaining}]};
 if(kind==='complete_montage')return {to:coordinator,subject:`MONTAGE KLART — ${c.address}`,heading:'Montage klart',rows:[...rows,...(p.comment?[{label:'Kommentar',value:p.comment}]:[])]};
 if(kind==='report_problem')return {to:coordinator,subject:`NY AVVIKELSE — ${c.address}`,heading:'Ny avvikelse',rows:[...rows,{label:'Typ',value:'Övrigt'},{label:'Beskrivning',value:p.description}]};
 if(kind==='book_km'||kind==='book_montage'){
 const to=c.team?teamEmails[c.team]:undefined;if(!to)return null;
 const km=kind==='book_km';return {to,subject:`${km?'KONTROLLMÄTNING TILLDELAD':'MONTAGE TILLDELAT'} — ${c.address}`,heading:km?'Du har blivit tilldelad en kontrollmätning':'Du har blivit tilldelad ett montage',rows:[...rows,{label:'Telefon',value:c.customer_phone||'Ej angivet'},{label:km?'KM-datum':'Montagedatum',value:p.date+(p.time?' '+p.time:'')},...(km?[{label:'Säljare',value:c.seller||'Ej angivet'}]:[])]};
 }
 return null;
}
const escape=(v:string)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
export async function sendActionEmail(mail:NonNullable<ReturnType<typeof actionEmail>>){
 const key=Deno.env.get('LOVABLE_API_KEY'),connection=Deno.env.get('RESEND_API_KEY');if(!key||!connection)throw new Error('Mejltjänsten saknar konfiguration.');
 const html=`<!doctype html><html lang="sv"><body><h2>${escape(mail.heading)}</h2><table>${mail.rows.map(r=>`<tr><th>${escape(r.label)}</th><td>${escape(r.value)}</td></tr>`).join('')}</table><p>via N3prenad-AI</p></body></html>`;
 const response=await fetch('https://connector-gateway.lovable.dev/resend/emails',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`,'X-Connection-Api-Key':connection},body:JSON.stringify({from:'SmartKlimat N3prenad <noreply@smartklimat.org>',to:[mail.to],cc:['mf@malke.se'],subject:mail.subject,html})});if(!response.ok)throw new Error('Mejlet kunde inte skickas.');
}
