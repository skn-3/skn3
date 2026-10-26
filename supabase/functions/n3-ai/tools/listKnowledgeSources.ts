import { type ToolContext } from './context.ts';
export const listKnowledgeSources={name:'list_knowledge_sources',description:'Lista aktiva kunskapskällor som användaren får söka i.',schema:{type:'object',properties:{},additionalProperties:false},async handler(_args:Record<string,unknown>,ctx:ToolContext){
 let q=ctx.userClient.from('knowledge_sources').select('key,title,audience').eq('enabled',true);
 if(!ctx.isAdmin&&ctx.role!=='coordinator')q=q.in('audience',['all',ctx.role]);
 const {data,error}=await q.order('title').limit(100);if(error)throw new Error('Kunskapskällorna kunde inte hämtas.');return {sources:data??[]};
}};
