import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMessagingUser } from './useMessagingUser';
export interface AiMessage { id:string; role:string; content:string; case_ids:string[]; created_at:string }
interface AiReply { reply:string; message_id?:string; case_ids?:string[]; error_code?:string }
export function useAiChat() {
 const userId=useMessagingUser(); const qc=useQueryClient();const [pending,setPending]=useState<AiMessage|null>(null);const [failure,setFailure]=useState<{reply:string;message:string}|null>(null);const [busy,setBusy]=useState(false);const lock=useRef(false); const owner=useRef(userId); owner.current=userId;
 useEffect(()=>{setPending(null);setFailure(null);},[userId]);
 const query=useQuery({queryKey:['ai-chat',userId],enabled:!!userId,queryFn:async()=>{
 const {data:thread,error}=await supabase.from('ai_threads').select('id').eq('user_id',userId??'').is('archived_at',null).maybeSingle();if(error)throw error;if(!thread)return {thread:null,messages:[] as AiMessage[]};
 const messages:AiMessage[]=[];for(let start=0;;start+=1000){const {data,error}=await supabase.from('ai_messages').select('id,role,content,case_ids,created_at').eq('thread_id',thread.id).in('role',['user','assistant']).order('created_at').order('id').range(start,start+999);if(error)throw error;messages.push(...(data??[]).filter(m=>m.content.trim()||m.case_ids.length));if((data?.length??0)<1000)break;}return {thread:thread.id,messages}; }});
 async function send(message:string){if(lock.current||!userId||!message.trim())return;lock.current=true;setBusy(true);setFailure(null);const viewer=userId;const optimistic={id:'pending',role:'user',content:message.trim(),case_ids:[],created_at:new Date().toISOString()};setPending(optimistic);
 try{const {data,error}=await supabase.functions.invoke<AiReply>('n3-ai',{body:{message:message.trim()}});if(error)throw error;if(!data)throw new Error('Inget svar från N3prenad-AI');if(owner.current!==viewer)return;
 await qc.invalidateQueries({queryKey:['ai-chat',viewer]});await qc.invalidateQueries({queryKey:['ai-usage']});
 if(data.error_code){setFailure({reply:data.reply,message:message.trim()});toast.error(data.reply);}else if(!data.message_id){setFailure({reply:data.reply,message:message.trim()});}
 }catch(error){if(owner.current===viewer){const reply=error instanceof Error?error.message:'Något gick fel hos N3prenad-AI. Försök igen.';setFailure({reply,message:message.trim()});toast.error(reply);await qc.invalidateQueries({queryKey:['ai-chat',viewer]});}}
 finally{if(owner.current===viewer)setPending(null);lock.current=false;setBusy(false);}}
 async function archive(){if(lock.current)return;const {error}=await supabase.rpc('ai_archive_thread');if(error){toast.error('Konversationen kunde inte rensas.');return;}setFailure(null);await qc.invalidateQueries({queryKey:['ai-chat',userId]});}
 const messages=query.data?.messages??[];
 return {messages:pending?[...messages,pending]:messages,busy,failure,send,archive,isLoading:query.isLoading,error:query.error,refetch:query.refetch};
}
