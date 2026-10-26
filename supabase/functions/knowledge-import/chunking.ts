export interface KnowledgeChunk {section:string|null;page:null;position:number;content:string}
// Keep headings as metadata and split long paragraphs at a word boundary.
export function chunkKnowledge(text:string):KnowledgeChunk[]{
 const chunks:KnowledgeChunk[]=[];let section:string|null=null,buffer='';
 const push=()=>{if(buffer.trim())chunks.push({section,page:null,position:chunks.length,content:buffer.trim()});buffer='';};
 const add=(paragraph:string)=>{
  let rest=paragraph.trim();
  while(rest.length>1400){push();let end=rest.lastIndexOf(' ',900);if(end<450)end=900;chunks.push({section,page:null,position:chunks.length,content:rest.slice(0,end).trim()});rest=rest.slice(end).trim();}
  if(buffer&&buffer.length+rest.length+2>1000)push();buffer+=(buffer?'\n\n':'')+rest;
  if(buffer.length>=900)push();
 };
 let paragraph:string[]=[];
 const flushParagraph=()=>{if(paragraph.length)add(paragraph.join('\n'));paragraph=[];};
 for(const line of text.replace(/\r\n?/g,'\n').replace(/^\uFEFF/,'').split('\n')){
  const heading=line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
  if(heading){flushParagraph();push();section=heading[1].trim();}
  else if(!line.trim())flushParagraph();else paragraph.push(line);
 }
 flushParagraph();push();return chunks;
}
