import { Fragment } from 'react';
function inline(text:string){return text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g).map((part,i)=>part.startsWith('**')||part.startsWith('__')?<strong key={i}>{part.slice(2,-2)}</strong>:<Fragment key={i}>{part}</Fragment>);}
/** Deliberately small, escaped markdown subset; never render HTML or executable links. */
export function AiMarkdown({text}:{text:string}){const lines=text.split('\n');return <div className="space-y-1 break-words">{lines.map((line,i)=>{const bullet=line.match(/^\s*[-*•]\s+(.*)/);return bullet?<div key={i} className="flex gap-2"><span aria-hidden="true">•</span><span>{inline(bullet[1])}</span></div>:<p key={i} className="min-h-4">{inline(line.replace(/^#{1,6}\s+/,''))}</p>;})}</div>;}
