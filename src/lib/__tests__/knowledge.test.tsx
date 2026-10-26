import { describe,it,expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { chunkKnowledge } from '../../../supabase/functions/knowledge-import/chunking';
import { AiMarkdown } from '@/components/chat/AiMarkdown';
import { searchKnowledge } from '../../../supabase/functions/n3-ai/tools/searchKnowledge';
describe('kunskapstext',()=>{
 it('delar vid rubriker och behåller avsnitt och position',()=>{expect(chunkKnowledge('# Montage\n\nFörsta stycket.\n\n## Lod\n\nAndra stycket.')).toEqual([{section:'Montage',page:null,position:0,content:'Första stycket.'},{section:'Lod',page:null,position:1,content:'Andra stycket.'}]);});
 it('begränsar varje textbit till högst 1400 tecken',()=>{const chunks=chunkKnowledge('# Lång text\n\n'+('ord '.repeat(2000)));expect(chunks.length).toBeGreaterThan(1);expect(chunks.every(c=>c.content.length<=1400&&c.content.length>0)).toBe(true);expect(chunks.map(c=>c.content).join(' ').replace(/\s/g,'')).toBe('ord'.repeat(2000));});
 it('delar även en lång obruten sträng',()=>{const chunks=chunkKnowledge('x'.repeat(4000));expect(chunks.every(c=>c.content.length<=1400)).toBe(true);expect(chunks.map(c=>c.content).join('')).toBe('x'.repeat(4000));});
 it('tom text ger inga bitar',()=>expect(chunkKnowledge('# Titel\n\n')).toEqual([]));
 it('bevarar stycken inom samma avsnitt',()=>expect(chunkKnowledge('Ett stycke.\r\n\r\nNästa.')[0].content).toBe('Ett stycke.\n\nNästa.'));
});
it('källhänvisning med sida och avsnitt förblir läsbar i AI-svaret',()=>{
 const html=renderToStaticMarkup(<AiMarkdown text={'**Lod:** kontrollera riktningen. (Montageboken, s. 12)\n(Sälj A till Ö, Efter kontrollmätning)'}/>);
 expect(html).toContain('(Montageboken, s. 12)');expect(html).toContain('(Sälj A till Ö, Efter kontrollmätning)');expect(html).toContain('<strong>Lod:</strong>');
});
it('kunskapsverktyget använder användarens RPC, högst 8 träffar och 1200 tecken',async()=>{
 let request:unknown;const result=await searchKnowledge.handler({query:'lod',source_key:'montageboken'},{name:'Test',role:'montor',isAdmin:false,now:new Date(),seenCaseIds:new Set(),userClient:{from:()=>null,rpc:async(name,args)=>{request={name,args};return {error:null,data:Array.from({length:10},()=>({source_title:'Montageboken',page:12,section:'Lod',content:'x'.repeat(1500)}))};}}});
 expect(request).toEqual({name:'search_knowledge',args:{p_query:'lod',p_source_key:'montageboken',p_limit:8}});expect(result.hits).toHaveLength(8);expect(result.hits[0].content).toHaveLength(1200);
});