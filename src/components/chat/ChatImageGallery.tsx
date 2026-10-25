import { useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { ChatAttachment } from '@/lib/chatAttachments';
function ChatPhoto({attachment,url,loading,onOpen,single}:{attachment:ChatAttachment;url?:string|null;loading:boolean;onOpen:()=>void;single:boolean}){
 const [failed,setFailed]=useState(false);
 if(loading)return <Skeleton className={single?'h-40 w-full':'h-28 w-full'}/>;
 if(!url||failed)return <div className="flex h-28 items-center justify-center rounded-lg border bg-muted px-2 text-center text-xs text-muted-foreground">Bilden kunde inte visas</div>;
 return <Button type="button" variant="ghost" className={`w-full p-0 overflow-hidden rounded-lg ${single?'h-auto min-h-11':'h-28'}`} aria-label={`Visa bild ${attachment.name}`} onClick={onOpen}><img src={url} alt={attachment.name} className={single?'block w-full max-h-80 object-contain':'h-28 w-full object-cover'} onError={()=>setFailed(true)}/></Button>;
}
export function ChatImageGallery({attachments,urls,loading}:{attachments:ChatAttachment[];urls?:Record<string,string|null>;loading:boolean}){
 const [selected,setSelected]=useState<ChatAttachment|null>(null);const start=useRef<{x:number;y:number}|null>(null);
 if(!attachments.length)return null;
 const single=attachments.length===1;const url=selected?urls?.[selected.path]:null;
 return <><div className={single?'w-[240px] max-w-full':'grid w-[240px] max-w-full grid-cols-2 gap-2'}>{attachments.map(a=><ChatPhoto key={a.path} attachment={a} url={urls?.[a.path]} loading={loading} single={single} onOpen={()=>setSelected(a)}/>)}</div>
 <Dialog open={!!selected} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent className="h-[100dvh] w-screen max-w-none rounded-none sm:rounded-none border-0 bg-ink-deep text-primary-foreground p-0 gap-0 shadow-none [&>button]:hidden" onTouchStart={e=>{start.current={x:e.touches[0].clientX,y:e.touches[0].clientY};}} onTouchEnd={e=>{const initial=start.current;const touch=e.changedTouches[0];if(initial&&touch&&(Math.abs(touch.clientX-initial.x)>80||Math.abs(touch.clientY-initial.y)>80))setSelected(null);start.current=null;}}>
 <DialogTitle className="sr-only">{selected?.name??'Bild'}</DialogTitle><DialogDescription className="sr-only">Bild i konversationen</DialogDescription>
 <div className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-10 flex gap-2"><Button asChild variant="secondary" className="min-h-11 gap-2" disabled={!url}><a href={url??undefined} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4"/>Ladda ner</a></Button><Button variant="secondary" size="icon" className="h-11 w-11" aria-label="Stäng bilden" onClick={()=>setSelected(null)}><X className="h-5 w-5"/></Button></div>
 <div className="flex h-full w-full items-center justify-center px-3 pb-4 pt-20" onClick={e=>{if(e.target===e.currentTarget)setSelected(null);}}>{url&&<img src={url} alt={selected?.name??'Chattbild'} className="max-h-full max-w-full object-contain"/>}</div>
 </DialogContent></Dialog></>;
}
