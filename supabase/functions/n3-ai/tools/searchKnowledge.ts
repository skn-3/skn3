import { text,type ToolContext } from './context.ts';
export const searchKnowledge={name:'search_knowledge',description:'Sök i kunskapskällor om rutiner, regler, toleranser, montage, lagar, skötsel, kundportal och säljprocesser. Ange källan i svaret; inga träffar betyder att du inte ska gissa.',schema:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:500},source_key:{type:'string',maxLength:100}},required:['query'],additionalProperties:false},async handler(args:Record<string,unknown>,ctx:ToolContext){
 const query=text(args.query,500);if(!query)throw new Error('Ange sökord.');const source=text(args.source_key,100);
 if(!ctx.userClient.rpc)throw new Error('Kunskapssökning är inte tillgänglig.');
 const {data,error}=await ctx.userClient.rpc('search_knowledge',{p_query:query,p_source_key:source||null,p_limit:8});if(error)throw new Error('Kunskapskällorna kunde inte sökas.');
 return {hits:(data??[]).slice(0,8).map((r:any)=>({source_key:r.source_key,source_title:r.source_title,section:r.section,page:r.page,content:String(r.content).slice(0,1200)}))};
}};
