import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const mocks = vi.hoisted(() => ({ custom: vi.fn(), dismiss: vi.fn() }));
vi.mock('sonner', () => ({ toast: mocks }));
import { incomingMessageToast } from './incomingMessageToast';

it('tryck på chattens toast öppnar rätt konversation och stänger toasten', () => {
  const opened = vi.fn();
  window.addEventListener('smartklimat:open-chat', opened);
  incomingMessageToast('message-1', 'Alex', 'conversation-1');
  const renderToast = mocks.custom.mock.calls[0][0] as (id: string) => ReactNode;
  render(renderToast('toast-1'));
  fireEvent.click(screen.getByRole('button'));
  expect((opened.mock.calls[0][0] as CustomEvent).detail).toBe('conversation-1');
  expect(mocks.dismiss).toHaveBeenCalledWith('toast-1');
  window.removeEventListener('smartklimat:open-chat', opened);
});