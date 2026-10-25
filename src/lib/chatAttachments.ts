export interface ChatAttachment { path:string; name:string; type:string; size:number; width:number; height:number }
export const MAX_CHAT_IMAGES=6;
export const MAX_CHAT_IMAGE_BYTES=10*1024*1024;
export function validateChatImages(files: readonly File[], existingCount=0): {accepted:File[];rejectedReason?:string} {
 const accepted:File[]=[];let rejectedReason:string|undefined;
 for(const file of files){
  if(!file.type.startsWith('image/')){rejectedReason??='Välj bara bilder.';continue;}
  if(file.size>MAX_CHAT_IMAGE_BYTES){rejectedReason??='Varje bild får vara högst 10 MB.';continue;}
  if(existingCount+accepted.length>=MAX_CHAT_IMAGES){rejectedReason??='Du kan skicka högst 6 bilder per meddelande.';continue;}
  accepted.push(file);
 }
 return {accepted,...(rejectedReason?{rejectedReason}:{})};
}
export function readChatAttachments(value:unknown):ChatAttachment[]{
 if(!Array.isArray(value))return [];
 return value.filter((a):a is ChatAttachment=>!!a&&typeof a==='object'&&typeof a.path==='string'&&typeof a.name==='string'&&typeof a.type==='string'&&typeof a.size==='number'&&typeof a.width==='number'&&typeof a.height==='number').slice(0,6);
}
export function previewText(message:{body?:string;attachments?:unknown}|null|undefined):string{
 if(!message)return 'Inga meddelanden ännu';
 if(message.body?.trim())return message.body;
 const count=readChatAttachments(message.attachments).length;
 return count===1?'Bild':count>1?`${count} bilder`:'Inga meddelanden ännu';
}
