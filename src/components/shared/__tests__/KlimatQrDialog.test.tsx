import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KlimatQrDialog } from '@/components/shared/KlimatQrDialog';

describe('KlimatQrDialog', () => {
  it('visar QR, rubrik och trädantal', () => {
    render(
      <KlimatQrDialog open onOpenChange={() => {}} claimUrl="https://smartklimat.org/c/test123" treeTotal={4} />,
    );
    expect(screen.getByText(/Vi har planterat/)).toBeInTheDocument();
    expect(screen.getByText('Scanna för att hämta ditt personliga värdebevis')).toBeInTheDocument();
    expect(screen.getByText(/4 träd planterade/)).toBeInTheDocument();
    expect(screen.getByTestId('klimat-qr').querySelector('svg')).toBeTruthy();
  });

  it('renderar inget utan claim_url', () => {
    const { container } = render(<KlimatQrDialog open onOpenChange={() => {}} claimUrl={null} />);
    expect(container.textContent).toBe('');
  });
});
