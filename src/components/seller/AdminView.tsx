import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ImportCaseForm } from './ImportCaseForm';
import { ValidatePipelineView } from './ValidatePipelineView';
import { CleanAddressesView } from './CleanAddressesView';
import { PayoutUploadView } from './PayoutUploadView';
import { ActivityLogView } from './ActivityLogView';

interface AdminViewProps {
  currentUser: string;
}

const ADMIN_SUBTABS = [
  { value: 'import', label: 'Importera ärende' },
  { value: 'validate', label: 'Validera pipeline' },
  { value: 'clean-addresses', label: 'Städa adresser' },
  { value: 'payouts', label: 'Ladda upp utbetalning' },
  { value: 'activity-log', label: 'Aktivitetslogg' },
] as const;

export function AdminView({ currentUser }: AdminViewProps) {
  const [sub, setSub] = useState<string>('import');

  return (
    <div className="px-3 md:px-0">
      <Tabs value={sub} onValueChange={setSub} className="w-full">
        <div className="overflow-x-auto -mx-3 md:mx-0 px-3 md:px-0">
          <TabsList className="inline-flex w-max">
            {ADMIN_SUBTABS.map(t => (
              <TabsTrigger key={t.value} value={t.value} className="whitespace-nowrap">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="import" className="mt-4">
          <ImportCaseForm sellerName={currentUser} />
        </TabsContent>
        <TabsContent value="validate" className="mt-4">
          <ValidatePipelineView currentUser={currentUser} />
        </TabsContent>
        <TabsContent value="clean-addresses" className="mt-4">
          <CleanAddressesView currentUser={currentUser} />
        </TabsContent>
        <TabsContent value="payouts" className="mt-4">
          <PayoutUploadView currentUser={currentUser} />
        </TabsContent>
        <TabsContent value="activity-log" className="mt-4">
          <ActivityLogView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
