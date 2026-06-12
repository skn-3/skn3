import { useState } from 'react';
import { cn } from '@/lib/utils';
import { OffersView } from './OffersView';
import { UppdragView } from '@/components/uppdrag/UppdragView';

export type OffersHubSubTab = 'offers' | 'uppdrag';

interface Props {
  currentUser: string;
  initialSubTab?: OffersHubSubTab;
}

export function OffersHub({ currentUser, initialSubTab = 'offers' }: Props) {
  const [subTab, setSubTab] = useState<OffersHubSubTab>(initialSubTab);

  const tabs: { value: OffersHubSubTab; label: string }[] = [
    { value: 'offers', label: 'Offerter' },
    { value: 'uppdrag', label: 'Uppdrag' },
  ];

  return (
    <div className="space-y-3">
      <div className="px-3 md:px-4">
        <div className="inline-flex gap-1 rounded-md bg-muted p-1">
          {tabs.map(t => (
            <button
              key={t.value}
              onClick={() => setSubTab(t.value)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-sm transition-colors',
                subTab === t.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {subTab === 'offers' && <OffersView currentUser={currentUser} />}
      {subTab === 'uppdrag' && <UppdragView />}
    </div>
  );
}
