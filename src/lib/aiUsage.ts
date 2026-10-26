export interface UsageRow { user_id:string; status:string; prompt_tokens:number; completion_tokens:number; total_tokens:number; created_at:string; kind?:string; audio_seconds?:number|null }
export function summarizeAiUsage(rows:UsageRow[], midnight:string) {
 const chat=rows.filter(r=>(r.kind??'chat')!=='transcribe');
 const voice=rows.filter(r=>r.kind==='transcribe');
 const voiceSum=(list:UsageRow[])=>({count:list.length,seconds:list.reduce((n,r)=>n+(r.audio_seconds??0),0)});
 const sum=(list:UsageRow[])=>({messages:list.filter(r=>r.status==='ok'||r.status==='error').length,tokens:list.reduce((n,r)=>n+r.total_tokens,0)});
 const users=new Map<string,{user_id:string;messages:number;tokens:number}>();for(const r of chat){const u=users.get(r.user_id)??{user_id:r.user_id,messages:0,tokens:0};if(r.status==='ok'||r.status==='error')u.messages++;u.tokens+=r.total_tokens;users.set(r.user_id,u);}
 return {today:sum(chat.filter(r=>r.created_at>=midnight)),month:sum(chat),errors:rows.filter(r=>r.status==='error').length,limits:rows.filter(r=>r.status==='limit').length,voice:{today:voiceSum(voice.filter(r=>r.created_at>=midnight)),month:voiceSum(voice)},top:[...users.values()].sort((a,b)=>b.messages-a.messages||b.tokens-a.tokens).slice(0,5)};
}
