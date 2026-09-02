import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVisualViewportHeight } from '../useVisualViewportHeight';

describe('useVisualViewportHeight', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns window.innerHeight when visualViewport is not available', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });

    const { result } = renderHook(() => useVisualViewportHeight());
    expect(result.current).toBe(800);
  });

  it('returns visualViewport.height when available', () => {
    Object.defineProperty(window, 'visualViewport', {
      value: { height: 500, addEventListener: vi.fn(), removeEventListener: vi.fn() },
      writable: true,
    });

    const { result } = renderHook(() => useVisualViewportHeight());
    expect(result.current).toBe(500);
  });

  it('updates on visualViewport resize', () => {
    let resizeHandler: (() => void) | undefined;
    const mockVV = {
      height: 500,
      addEventListener: vi.fn((_: string, handler: () => void) => { resizeHandler = handler; }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', { value: mockVV, writable: true });

    const { result } = renderHook(() => useVisualViewportHeight());
    expect(result.current).toBe(500);

    act(() => {
      mockVV.height = 300;
      resizeHandler?.();
    });

    expect(result.current).toBe(300);
  });

  it('cleans up event listener on unmount', () => {
    const removeEventListener = vi.fn();
    const mockVV = {
      height: 500,
      addEventListener: vi.fn(),
      removeEventListener,
    };
    Object.defineProperty(window, 'visualViewport', { value: mockVV, writable: true });

    const { unmount } = renderHook(() => useVisualViewportHeight());
    unmount();

    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
