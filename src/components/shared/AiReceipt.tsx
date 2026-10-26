import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SignedImage } from './SignedImage';
import { getSignedImageUrl } from '@/lib/signedImage';
import { toast } from 'sonner';
export function AiReceipt({path,label='kvitto'}:{path:string;label?:string}){
 const [busy,setBusy]=useState(false);
 async function open(){setBusy(true);const url=await getSignedImageUrl(path,'ai-receipts');setBusy(false);if(url)window.open(url,'_blank','noopener,noreferrer');else toast.error('Bilden kunde inte visas.');}
 return <Button type="button" variant="outline" className="h-12 w-12 shrink-0 p-0 overflow-hidden" aria-label={`Öppna ${label}`} disabled={busy} onClick={()=>void open()}><SignedImage bucket="ai-receipts" value={path} alt={label} className="h-full w-full object-cover"/></Button>;
}