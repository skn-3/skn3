import { KlimatQrDialog } from '@/components/shared/KlimatQrDialog';

export default function QrDemo() {
  return (
    <KlimatQrDialog
      open
      onOpenChange={() => {}}
      claimUrl="https://app.smartklimat.org/h/EXEMPEL1"
      treeTotal={1}
    />
  );
}
