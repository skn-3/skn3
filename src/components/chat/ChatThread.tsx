import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ImagePlus, Loader2, Maximize2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useChat } from '@/hooks/useChat';
import { useIsMobile } from '@/hooks/use-mobile';
import { useChatCases } from '@/hooks/useChatCases';
import { useChatImages } from '@/hooks/useChatImages';
import { caseFallbackBody, chatRoleLabel, conversationSubtitle, extractCaseIdFromText, groupChatMessages, shouldSendOnKey } from '@/lib/chat';
import { readChatAttachments, validateChatImages } from '@/lib/chatAttachments';
import { ChatAvatar, ConversationAvatar } from './ChatAvatars';
import { ChatCaseCard } from './ChatCaseCard';
import { ChatCasePicker } from './ChatCasePicker';
import { ChatImageGallery } from './ChatImageGallery';
import { ChatImageDrafts } from './ChatImageDrafts';
import type { ChatViewMode } from './ChatView';

const TEXTAREA_MAX_PX = 168; // ungefär sex rader
const BOTTOM_SLACK_PX = 48;

function clock(iso: string) { return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }); }

/** En konversation: huvud, meddelanden som rader (förankrade i botten) och skrivfält. Monteras med key per konversation. */
export function ChatThread({ mode, onClose, onExpand, onOpenCase }: { mode: ChatViewMode; onClose?: () => void; onExpand?: () => void; onOpenCase: (id: string) => void }) {
  const chat = useChat();
  const mobile = useIsMobile();
  const compact = mode === 'compact';
  const id = chat.activeId as string;
  const conversation = chat.activeConversation;
  const name = conversation?.name ?? 'Konversation';

  // Utkast: text och bilder sparas per konversation i ChatProvider så att de följer med mellan ruta och flik.
  const [body, setBody] = useState(() => chat.getDraft(id).body);
  const [files, setFiles] = useState<File[]>(() => chat.getDraft(id).files);
  const { saveDraft } = chat;
  useEffect(() => { saveDraft(id, { body, files }); }, [id, body, files, saveDraft]);
  const [busy, setBusy] = useState(false);
  const sendLock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const messages = chat.messages;
  const rows = useMemo(() => groupChatMessages(messages), [messages]);
  const signedImages = useChatImages(id, messages.flatMap(m => readChatAttachments(m.attachments).map(a => a.path)));
  const caseIds = messages.map(m => m.case_id || extractCaseIdFromText(m.body)).filter((v): v is string => !!v);
  const chatCases = useChatCases(caseIds);

  // Förankring i botten.
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const keepScroll = useRef<number | null>(null);
  const seenLast = useRef<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const last = messages.at(-1);
  function toBottom() {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    stick.current = true;
    setShowJump(false);
  }
  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK_PX;
    stick.current = atBottom;
    if (atBottom) setShowJump(false);
  }
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && keepScroll.current !== null) { el.scrollTop = el.scrollHeight - keepScroll.current; keepScroll.current = null; }
  }, [messages.length]);
  useLayoutEffect(() => {
    if (!last || seenLast.current === last.id) return;
    const first = seenLast.current === null;
    seenLast.current = last.id;
    if (first || stick.current || last.sender_id === chat.userId) toBottom(); else setShowJump(true);
  }, [last, chat.userId]);
  useEffect(() => {
    const el = content.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Bilder som laddas in senare ska inte knuffa upp den som redan är längst ner.
    const observer = new ResizeObserver(() => { if (stick.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  async function loadOlder() {
    const el = scroller.current;
    keepScroll.current = el ? el.scrollHeight - el.scrollTop : null;
    stick.current = false;
    await chat.loadOlder();
  }

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
  }, [body]);
  useEffect(() => { if (!mobile) textarea.current?.focus({ preventScroll: true }); }, [mobile]);

  function addFiles(next: File[]) {
    if (busy) return;
    setFiles(old => { const result = validateChatImages(next, old.length); if (result.rejectedReason) toast.error(result.rejectedReason); return [...old, ...result.accepted]; });
  }
  const pendingCase = chat.pendingCase;
  const canSend = !!conversation && (!!body.trim() || !!pendingCase || files.length > 0) && !busy;
  async function send() {
    if (!conversation || (!body.trim() && !pendingCase && !files.length) || sendLock.current) return;
    sendLock.current = true;
    setBusy(true);
    try {
      await chat.send(id, body.trim() || (pendingCase ? caseFallbackBody(pendingCase.address) : ''), files, pendingCase?.id);
      setBody(''); setFiles([]); chat.setPendingCase(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Meddelandet kunde inte skickas. Försök igen.');
    } finally { sendLock.current = false; setBusy(false); }
  }

  const subtitle = conversation ? conversationSubtitle(conversation, chat.userId, chat.names, chat.roles) : '';
  const avatarSize = compact ? 32 : 36;

  return (
    <div className={cn('flex h-full min-h-0 flex-col text-foreground', compact && 'safe-bottom')}>
      <header className={cn('flex min-h-[60px] shrink-0 items-center gap-2.5 border-b py-2', compact ? 'px-2' : 'px-4')}>
        {compact && <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" aria-label="Tillbaka till konversationer" onClick={chat.backToList}><ArrowLeft className="h-5 w-5" /></Button>}
        {conversation && <ConversationAvatar conversation={conversation} viewerId={chat.userId} roles={chat.roles} size={compact ? 34 : 38} />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-bold leading-tight">{name}</h2>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {onExpand && <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" aria-label="Öppna i helskärm" onClick={onExpand}><Maximize2 className="h-5 w-5" /></Button>}
        {onClose && <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" aria-label="Stäng chatten" onClick={onClose}><X className="h-5 w-5" /></Button>}
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} className={cn('h-full overflow-y-auto py-3', compact ? 'px-3' : 'px-5')} role="log" aria-label={`Meddelanden i ${name}`}>
          <div ref={content}>
            {!conversation ? (
              chat.isLoading ? <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : <p className="py-10 text-center text-muted-foreground">Konversationen kunde inte hittas.</p>
            ) : chat.messagesError ? (
              <div className="space-y-3 py-10 text-center"><p>Kunde inte hämta meddelanden.</p><Button variant="outline" className="min-h-11" onClick={() => void chat.refetchMessages()}>Försök igen</Button></div>
            ) : chat.messagesLoading ? (
              <div className="space-y-4">{[0, 1, 2].map(i => <div key={i} className="flex gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-full max-w-md" /></div></div>)}</div>
            ) : !messages.length ? (
              <p className="py-10 text-center text-muted-foreground">Inga meddelanden ännu. Skriv det första.</p>
            ) : <>
              {chat.hasOlder && (
                <div className="flex justify-center pb-2">
                  <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={chat.loadingOlder} onClick={() => void loadOlder()}>
                    {chat.loadingOlder && <Loader2 className="mr-1 h-4 w-4 animate-spin motion-reduce:animate-none" />}Visa äldre
                  </Button>
                </div>
              )}
              {rows.map(({ message: m, showHeader, dayLabel }) => {
                const mine = m.sender_id === chat.userId;
                const realName = chat.names.get(m.sender_id) ?? 'Användare';
                const role = chat.roles.get(m.sender_id);
                const caseId = m.case_id || extractCaseIdFromText(m.body);
                const linkedCase = chatCases.data?.find(c => c.id === caseId);
                const fallbackOnly = !!caseId && (linkedCase ? m.body === caseFallbackBody(linkedCase.address) : !!m.case_id && m.body.startsWith('Ärende: '));
                const attachments = readChatAttachments(m.attachments);
                return (
                  <Fragment key={m.id}>
                    {dayLabel && (
                      <div role="separator" aria-label={dayLabel} className="my-4 flex items-center gap-3 text-xs font-medium text-muted-foreground">
                        <span className="h-px flex-1 bg-border" /><span>{dayLabel}</span><span className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div className={cn('flex gap-3', showHeader && !dayLabel ? 'mt-4' : showHeader ? '' : 'mt-1')}>
                      <div className="shrink-0" style={{ width: avatarSize }}>{showHeader && <ChatAvatar name={realName} role={role} size={avatarSize} />}</div>
                      <div className="min-w-0 max-w-[640px] flex-1">
                        {showHeader ? (
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-semibold">{mine ? 'Du' : realName}</span>
                            {role && <span className="text-xs text-muted-foreground">{chatRoleLabel(role)}</span>}
                            <time className="font-mono text-[11px] text-muted-foreground" dateTime={m.created_at}>{clock(m.created_at)}</time>
                          </div>
                        ) : <span className="sr-only">{mine ? 'Du' : realName} {clock(m.created_at)}</span>}
                        {!fallbackOnly && m.body && <p className={cn('whitespace-pre-wrap break-words', compact ? 'text-[15px] leading-normal' : 'text-[14.5px] leading-[1.5]')}>{m.body}</p>}
                        {attachments.length > 0 && <div className="mt-1.5"><ChatImageGallery attachments={attachments} urls={signedImages.data} loading={signedImages.isLoading} /></div>}
                        {caseId && <div className="mt-1.5 max-w-sm"><ChatCaseCard caseData={linkedCase} loading={chatCases.isLoading} onOpen={() => onOpenCase(caseId)} /></div>}
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </>}
          </div>
        </div>
        {showJump && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <Button type="button" size="sm" className="pointer-events-auto min-h-11 gap-1.5 rounded-full shadow-lg" onClick={toBottom}><ArrowDown className="h-4 w-4" />Nya meddelanden</Button>
          </div>
        )}
      </div>

      <form className={cn('shrink-0 pb-3 pt-1', compact ? 'px-3' : 'px-5')} onSubmit={e => { e.preventDefault(); void send(); }}>
        <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" aria-label="Välj chattbilder" onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        <div className="rounded-xl border border-border-strong bg-card focus-within:ring-2 focus-within:ring-ring">
          {files.length > 0 && <div className="px-2"><ChatImageDrafts files={files} disabled={busy} onRemove={index => setFiles(old => old.filter((_, i) => i !== index))} /></div>}
          {pendingCase && (
            <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg border bg-muted pl-3 text-sm">
              <span className="min-w-0 flex-1 break-words py-2">Bifogat ärende: {pendingCase.address}</span>
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Ta bort bifogat ärende" onClick={() => chat.setPendingCase(null)}><X className="h-4 w-4" /></Button>
            </div>
          )}
          <Textarea
            ref={textarea} rows={1} aria-label={`Meddelande till ${name}`} placeholder={`Skriv till ${name}`} enterKeyHint="send" maxLength={10000}
            className="min-h-[44px] resize-none border-0 bg-transparent px-3 py-2.5 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:text-[15px]"
            style={{ maxHeight: TEXTAREA_MAX_PX }}
            value={body} disabled={busy}
            onChange={e => setBody(e.target.value)}
            onPaste={e => {
              if (mobile) return;
              const images = Array.from(e.clipboardData.items).filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file);
              if (images.length) { e.preventDefault(); addFiles(images); }
            }}
            onKeyDown={e => { if (shouldSendOnKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) { e.preventDefault(); void send(); } }}
          />
          <div className="flex items-center gap-1 px-1.5 pb-1.5">
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Bifoga bild" disabled={busy || files.length >= 6} onClick={() => fileInput.current?.click()}><ImagePlus className="h-5 w-5" /></Button>
            <ChatCasePicker onSelect={chat.setPendingCase} />
            <Button type="submit" className="ml-auto min-h-11 gap-1.5 px-4" disabled={!canSend}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Send className="h-4 w-4" />}{busy ? 'Skickar…' : 'Skicka'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
