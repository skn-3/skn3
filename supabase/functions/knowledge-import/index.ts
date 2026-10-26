import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.25.76';
import { requireAdmin } from '../_shared/auth.ts';
import { chunkKnowledge } from './chunking.ts';
const Body=z.object({key:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),title:z.string().trim().min(1).max(200),audience:z.enum(['all','montor','seller']),filename:z.string().max(255).regex(/\.(md|txt)$/i),text:z.string().trim().min(1).max(5000000)}).strict();
Deno.serve(async req=>{
 const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});if(req.method!=='POST')return respond({error:'Ogiltig förfrågan.'},405);
 const auth=await requireAdmin(req,corsHeaders);if(auth.response)return auth.response;
 const parsed=Body.safeParse(await req.json().catch(()=>null));if(!parsed.success)return respond({error:'Ange titel, giltig nyckel, målgrupp och en .md- eller .txt-fil (högst 5 MB text).'},400);
 const body=parsed.data,chunks=chunkKnowledge(body.text);if(!chunks.length||chunks.length>10000)return respond({error:'Filen saknar text eller är för stor.'},400);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_ANON_KEY');if(!url||!key)return respond({error:'Importen saknar konfiguration.'},500);
 const client=createClient(url,key,{global:{headers:{Authorization:req.headers.get('Authorization')??''}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.rpc('knowledge_replace',{p_key:body.key,p_title:body.title,p_audience:body.audience,p_origin:body.filename,p_chunks:chunks});
 if(error)return respond({error:'Källan kunde inte importeras. Befintliga textbitar är oförändrade.'},500);
 return respond({source_id:data,chunks:chunks.length});
});
