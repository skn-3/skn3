import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMessagingUser } from './useMessagingUser';
export function useChatImages(conversationId:string|null,paths:string[]){
 const userId=useMessagingUser();const sorted=[...new Set(paths)].filter(p=>conversationId&&p.startsWith(conversationId+'/')).sort();
 return useQuery({queryKey:['chat-images',conversationId,sorted.join(','),userId],enabled:!!userId&&!!conversationId&&sorted.length>0,staleTime:50*60000,refetchInterval:50*60000,retry:false,queryFn:async()=>{
 const {data,error}=await supabase.storage.from('chat-images').createSignedUrls(sorted,3600);if(error)throw error;
 return Object.fromEntries((data??[]).map(item=>[item.path,item.error?null:item.signedUrl]));
 }});
}
