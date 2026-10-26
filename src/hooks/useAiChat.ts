import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMessagingUser } from './useMessagingUser';
export interface AiMessage { id:string; role:string; content:string; case_ids:string[]; created_at:string; action_id?:string|null }
export interface AiAction { id:string;kind:string;status:string;created_at:string;decided_at:string|null;error:string|null;payload:{case_id:string;address:string;city?:string|null;amount?:number;description?:string;receipt_path?:string;photo_path?:string;title?:string;rows?:{label:string;value:string}[]} }
interface AiReply { reply:string; message_id?:string; case_ids?:string[]; error_code?:string }
export function useAiChat() {
 const userId=useMessagingUser(); const qc=useQueryClient();const [pending,setPending]=useState<AiMessage|null>(null);const [failure,setFailure]=useState<{reply:string;message:string}|null>(null);const [busy,setBusy]=useState(false);const lock=useRef(false); const owner=useRef(userId); owner.current=userId;
 useEffect(()=>{setPending(null);setFailure(null);},[userId]);
 const query=useQuery({queryKey:['ai-chat',userId],enabled:!!userId,queryFn:async()=>{
 const {data:thread,error}=await supabase.from('ai_threads').select('id').eq('user_id',userId??'').is('archived_at',null).maybeSingle();if(error)throw error;if(!thread)return {thread:null,messages:[] as AiMessage[],actions:[] as AiAction[]};
 const messages:AiMessage[]=[];for(let start=0;;start+=1000){const {data,error}=await supabase.from('ai_messages').select('id,role,content,case_ids,created_at,action_id').eq('thread_id',thread.id).in('role',['user','assistant']).order('created_at').order('id').range(start,start+999);if(error)throw error;messages.push(...(data??[]).filter(m=>m.content.trim()||m.case_ids.length||m.action_id));if((data?.length??0)<1000)break;}
 const {data:actions,error:actionError}=await supabase.from('ai_actions').select('*').eq('thread_id',thread.id).order('created_at');if(actionError)throw actionError;return {thread:thread.id,messages,actions:(actions??[]) as unknown as AiAction[]}; }});
 async function send(message:string,receiptPath?:string){if(lock.current||!userId||!message.trim())return false;lock.current=true;setBusy(true);setFailure(null);const viewer=userId;const optimistic={id:'pending',role:'user',content:message.trim(),case_ids:[],created_at:new Date().toISOString()};setPending(optimistic);
 try{const {data,error}=await supabase.functions.invoke<AiReply>('n3-ai',{body:{message:message.trim(),...(receiptPath?{receipt_path:receiptPath}:{})}});if(error)throw error;if(!data)throw new Error('Inget svar från N3prenad-AI');if(owner.current!==viewer)return false;
 await qc.invalidateQueries({queryKey:['ai-chat',viewer]});await qc.invalidateQueries({queryKey:['ai-usage']});
 if(data.error_code){setFailure({reply:data.reply,message:message.trim()});toast.error(data.reply);return false;}else if(!data.message_id){setFailure({reply:data.reply,message:message.trim()});return false;}return true;
 }catch(error){if(owner.current===viewer){const reply=error instanceof Error?error.message:'Något gick fel hos N3prenad-AI. Försök igen.';setFailure({reply,message:message.trim()});toast.error(reply);await qc.invalidateQueries({queryKey:['ai-chat',viewer]});}return false;}
 finally{if(owner.current===viewer)setPending(null);lock.current=false;setBusy(false);}}
 async function archive(){if(lock.current)return;const {error}=await supabase.rpc('ai_archive_thread');if(error){toast.error('Konversationen kunde inte rensas.');return;}setFailure(null);await qc.invalidateQueries({queryKey:['ai-chat',userId]});}
 async function decide(actionId:string,action:'confirm'|'cancel'){
 const viewer=userId;if(!viewer)return;
 try{const {data,error}=await supabase.functions.invoke<AiReply>('n3-ai',{body:{action,action_id:actionId}});if(error)throw error;if(data?.error_code)toast.error(data.reply);}
 catch{toast.error('Beslutet kunde inte skickas. Kontrollera kortets status innan du försöker igen.');}
  finally{if(owner.current===viewer)await Promise.all(['ai-chat','ai-usage','case_costs','case_events','cases','case','deviations','deviations_bulk','montor-cases','calendar','notifications'].map(key=>qc.invalidateQueries({queryKey:key==='ai-chat'?[key,viewer]:[key]})));}
 }
 const messages=query.data?.messages??[];
 const duplicatePending=pending && messages.at(-1)?.role==='user' && messages.at(-1)?.content===pending.content;
 return {messages:pending&&!duplicatePending?[...messages,pending]:messages,actions:query.data?.actions??[],userId,busy,failure,send,decide,archive,isLoading:query.isLoading,error:query.error,refetch:query.refetch};
}
