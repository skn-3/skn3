import { Building2, Megaphone, Sparkles, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { chatInitials, type ChatListConversation } from '@/lib/chat';

/** Rund initialavatar: personal i primärfärg, montörer i sekundärfärg. */
export function ChatAvatar({ name, role, size = 36, className }: { name: string | null | undefined; role?: string | null; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold leading-none',
        role === 'montor' ? 'bg-secondary text-secondary-foreground' : 'bg-primary text-primary-foreground', className)}
    >
      {chatInitials(name)}
    </span>
  );
}

function IconBadge({ size, children }: { size: number; children: React.ReactNode }) {
  return <span aria-hidden="true" style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:h-[55%] [&_svg]:w-[55%] [&_svg]:max-h-5 [&_svg]:max-w-5">{children}</span>;
}

export function AiAvatar({ size = 36 }: { size?: number }) {
  return <span aria-hidden="true" style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center rounded-full bg-gold text-gold-foreground [&_svg]:h-[50%] [&_svg]:w-[50%] [&_svg]:max-h-5 [&_svg]:max-w-5"><Sparkles /></span>;
}

/** Ikon eller avatar för en konversation: Alla (Megaphone), Kontoret och den egna teamkanalen (Building2), team (initialer), direkt (den andres initialer), grupp (Users). */
export function ConversationAvatar({ conversation, viewerId, roles, size = 36 }: { conversation: ChatListConversation; viewerId: string | null; roles: ReadonlyMap<string, string>; size?: number }) {
  if (conversation.kind === 'channel') {
    if (conversation.channel_key === 'alla') return <IconBadge size={size}><Megaphone /></IconBadge>;
    if (conversation.channel_key === 'kontoret' || conversation.team_user_id === viewerId) return <IconBadge size={size}><Building2 /></IconBadge>;
    return <ChatAvatar name={conversation.name} role="montor" size={size} />;
  }
  if (conversation.kind === 'group') return <IconBadge size={size}><Users /></IconBadge>;
  const other = conversation.member_ids.find(id => id !== viewerId);
  return <ChatAvatar name={conversation.name} role={other ? roles.get(other) : null} size={size} />;
}
