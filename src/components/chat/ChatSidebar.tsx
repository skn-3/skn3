import { useMemo, useState } from 'react';
import { Bell, Image as ImageIcon, Lock, Maximize2, Plus, Search, X } from 'lucide-react';
import { usePush } from '@/hooks/usePush';
import { openPushGuide, PUSH_TEXTS } from '@/lib/push/guide';
import { pushNeedsAttention } from '@/lib/push/platform';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CountPill } from '@/components/ui/chip';
import { cn } from '@/lib/utils';
import { useChat } from '@/hooks/useChat';
import { relativeTimeSv } from '@/lib/relativeTimeSv';
import { readChatAttachments } from '@/lib/chatAttachments';
import { AI_CONVERSATION_NAME, chatPreviewLine, chatSidebarSections, type ChatListConversation } from '@/lib/chat';
import { AiAvatar, ConversationAvatar } from './ChatAvatars';
import type { ChatViewMode } from './ChatView';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{children}</h3>;
}

const rowFocus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

/** Listan med Kanaler, Team och Direkt. Full: täta rader med namn och olästa. Compact: rader med förhandsrad och tid. */
export function ChatSidebar({ mode, onClose, onExpand }: { mode: ChatViewMode; onClose?: () => void; onExpand?: () => void }) {
  const chat = useChat();
  const push = usePush();
  const [query, setQuery] = useState('');
  const compact = mode === 'compact';
  const sections = useMemo(() => chatSidebarSections(chat.conversations, chat.userId, chat.isStaff, query), [chat.conversations, chat.userId, chat.isStaff, query]);

  const conversationRow = (c: ChatListConversation) => {
    const active = !compact && chat.activeId === c.id;
    const lock = c.kind === 'channel' && c.channel_key === 'kontoret' ? <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Bara kontoret" /> : null;
    const unread = c.unread > 0 ? <CountPill tone="danger"><span aria-hidden="true">{c.unread}</span><span className="sr-only">{c.unread} olästa</span></CountPill> : null;
    if (!compact) {
      return (
        <li key={c.id}>
          <button type="button" aria-current={active ? 'true' : undefined} onClick={() => chat.openConversation(c.id)}
            className={cn('flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm active:bg-muted', rowFocus,
              active ? 'bg-success-soft font-semibold text-primary' : c.unread ? 'font-semibold text-foreground' : 'text-foreground')}>
            <ConversationAvatar conversation={c} viewerId={chat.userId} roles={chat.roles} size={26} />
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            {lock}{unread}
          </button>
        </li>
      );
    }
    const imageOnly = !!c.latest && !c.latest.body.trim() && readChatAttachments(c.latest.attachments).length > 0;
    return (
      <li key={c.id}>
        <button type="button" onClick={() => chat.openConversation(c.id)}
          className={cn('flex min-h-16 w-full items-center gap-3 border-b px-3 py-2.5 text-left active:bg-muted', rowFocus)}>
          <ConversationAvatar conversation={c} viewerId={chat.userId} roles={chat.roles} size={40} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className={cn('min-w-0 flex-1 truncate', c.unread ? 'font-semibold' : 'font-medium')}>{c.name}</span>
              {lock}
              <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTimeSv(c.latest?.created_at ?? c.created_at)}</span>
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              {imageOnly && <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              <span className="min-w-0 flex-1 truncate">{chatPreviewLine(c.latest, chat.userId, chat.names)}</span>
              {unread}
            </span>
          </span>
        </button>
      </li>
    );
  };

  const aiRow = (
    <li key="n3prenad-ai">
      <button type="button" aria-current={!compact && chat.aiActive ? 'true' : undefined} onClick={chat.openAi}
        className={cn(compact ? 'flex min-h-16 w-full items-center gap-3 border-b px-3 py-2.5 text-left active:bg-muted' : 'flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm active:bg-muted', rowFocus,
          !compact && chat.aiActive && 'bg-success-soft font-semibold text-primary')}>
        <AiAvatar size={compact ? 40 : 26} />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate', compact && 'font-medium')}>{AI_CONVERSATION_NAME}</span>
          {compact && <span className="mt-0.5 block text-xs text-muted-foreground">Fråga om ärenden</span>}
        </span>
      </button>
    </li>
  );

  const empty = !sections.channels.length && !sections.teams.length && !sections.direct.length;
  return (
    <div className={cn('flex h-full min-h-0 flex-col text-foreground', compact && 'safe-bottom')}>
      <div className={cn('shrink-0 space-y-2 px-3 pb-2', compact ? 'pt-2' : 'pt-4')}>
        <div className="flex items-center gap-1">
          <h2 className="min-w-0 flex-1 truncate pl-1 font-display text-[22px] font-bold leading-tight">Chatt</h2>
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Ny konversation" onClick={chat.openNew}><Plus className="h-5 w-5" /></Button>
          {onExpand && <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Öppna i helskärm" onClick={onExpand}><Maximize2 className="h-5 w-5" /></Button>}
          {onClose && <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Stäng chatten" onClick={onClose}><X className="h-5 w-5" /></Button>}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label="Sök konversation" placeholder="Sök konversation" className="min-h-11 pl-9" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>
      {push.checked && pushNeedsAttention(push.status) && (
        <div className="mx-3 mb-2 flex shrink-0 items-center gap-2.5 rounded-lg border border-border bg-gold-soft py-1.5 pl-3 pr-1.5 text-sm text-gold-ink">
          <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 py-1 font-medium leading-snug">{PUSH_TEXTS.nudge}</span>
          <Button type="button" variant="outline" className="h-11 shrink-0 bg-card px-3" onClick={openPushGuide}>{PUSH_TEXTS.nudgeButton}</Button>
        </div>
      )}
      {chat.pendingCase && (
        <div className="mx-3 mb-2 flex shrink-0 items-center gap-2 rounded-lg bg-gold-soft px-3 text-sm text-gold-ink">
          <span className="min-w-0 flex-1 break-words py-2">Dela ärende: {chat.pendingCase.address} — välj konversation</span>
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Avbryt delning" onClick={() => chat.setPendingCase(null)}><X className="h-4 w-4" /></Button>
        </div>
      )}
      <nav aria-label="Konversationer" className={cn('min-h-0 flex-1 overflow-y-auto pb-3', !compact && 'px-2')}>
        {chat.error ? (
          <div className="space-y-3 p-4"><p>Kunde inte hämta konversationer.</p><Button variant="outline" className="min-h-11" onClick={() => void chat.refetch()}>Försök igen</Button></div>
        ) : chat.isLoading ? (
          <div className="space-y-2 p-3">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className={compact ? 'h-14' : 'h-9'} />)}</div>
        ) : empty ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">Inga konversationer matchar.</p>
        ) : <>
          {sections.channels.length > 0 && <section><SectionTitle>Kanaler</SectionTitle><ul>{sections.channels.map(conversationRow)}</ul></section>}
          {chat.isStaff && sections.teams.length > 0 && <section><SectionTitle>Team</SectionTitle><ul>{sections.teams.map(conversationRow)}</ul></section>}
          {sections.direct.length > 0 && <section><SectionTitle>Direkt</SectionTitle><ul>{sections.direct.map(item => item.type === 'ai' ? aiRow : conversationRow(item.conversation))}</ul></section>}
        </>}
      </nav>
    </div>
  );
}
