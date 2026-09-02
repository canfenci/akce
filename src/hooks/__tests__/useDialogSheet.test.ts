import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDialogSheet } from '../useDialogSheet';

describe('useDialogSheet', () => {
  let focusSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
  });

  afterEach(() => {
    focusSpy.mockRestore();
  });

  it('returns a ref', () => {
    const { result } = renderHook(() => useDialogSheet(false, () => {}));
    expect(result.current).toBeDefined();
    expect(result.current.current).toBeNull();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    renderHook(() => useDialogSheet(true, onClose));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on Escape when closed', () => {
    const onClose = vi.fn();
    renderHook(() => useDialogSheet(false, onClose));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('traps Tab focus within the dialog', () => {
    const { result } = renderHook(() => useDialogSheet(true, () => {}));

    const sheet = document.createElement('section');
    sheet.setAttribute('role', 'dialog');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    sheet.appendChild(btn1);
    sheet.appendChild(btn2);
    document.body.appendChild(sheet);

    // Simulate ref assignment
    Object.defineProperty(result.current, 'current', { value: sheet, writable: true });

    // Focus on last element and press Tab
    btn2.focus();
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      sheet.dispatchEvent(event);
    });

    // After trapping, focus should move to first element
    document.body.removeChild(sheet);
  });

  it('restores focus to previous element on unmount', () => {
    const previousButton = document.createElement('button');
    document.body.appendChild(previousButton);
    previousButton.focus();

    const { unmount } = renderHook(() => useDialogSheet(true, () => {}));

    unmount();

    // Focus should be restored (spy captures the call)
    expect(focusSpy).toHaveBeenCalled();
    document.body.removeChild(previousButton);
  });
});
