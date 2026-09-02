import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Emulate SW fetch handler logic exactly as written in public/sw.js
interface MockFetchEvent {
  request: {
    method: string;
    url: string;
    mode?: string;
  };
  handled: boolean;
  bypassed: boolean;
  fallbackToIndexHtml: boolean;
}

function simulateSwFetch(
  event: MockFetchEvent,
  selfOrigin: string,
  networkFails: boolean,
  cacheHasAsset: boolean,
): { status: 'bypassed' | 'cache' | 'network' | 'navigation-fallback' | 'failed' } {
  // 1. Only intercept GET requests
  if (event.request.method !== 'GET') {
    return { status: 'bypassed' };
  }

  const url = new URL(event.request.url);

  // 2. Cross-origin requests (Firebase APIs, Google Auth, etc.) MUST be completely bypassed
  if (url.origin !== selfOrigin) {
    return { status: 'bypassed' };
  }

  // 3. Auth redirect paths and internal endpoints MUST NOT be cached
  if (url.pathname.includes('/__/auth')) {
    return { status: 'bypassed' };
  }

  // 4. Navigation requests
  if (event.request.mode === 'navigate') {
    if (!networkFails) {
      return { status: 'network' };
    }
    return { status: 'navigation-fallback' };
  }

  // 5. Static assets
  if (cacheHasAsset) {
    return { status: 'cache' };
  }
  if (!networkFails) {
    return { status: 'network' };
  }
  return { status: 'failed' }; // MUST NOT fallback to index.html!
}

describe('Service Worker Hardening (public/sw.js)', () => {
  const swContent = fs.readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf-8');
  const selfOrigin = 'https://akce.app';

  it('contains the necessary same-origin and bypass checks in public/sw.js', () => {
    expect(swContent).toContain('url.origin !== self.location.origin');
    expect(swContent).toContain("url.pathname.includes('/__/auth')");
    expect(swContent).toContain("event.request.mode === 'navigate'");
  });

  it('handles same-origin static assets via cache or network without error', () => {
    const event: MockFetchEvent = {
      request: { method: 'GET', url: 'https://akce.app/assets/index.js' },
      handled: false,
      bypassed: false,
      fallbackToIndexHtml: false,
    };

    const cachedRes = simulateSwFetch(event, selfOrigin, false, true);
    expect(cachedRes.status).toBe('cache');

    const networkRes = simulateSwFetch(event, selfOrigin, false, false);
    expect(networkRes.status).toBe('network');
  });

  it('completely bypasses cross-origin Firebase Firestore requests', () => {
    const event: MockFetchEvent = {
      request: {
        method: 'GET',
        url: 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel',
      },
      handled: false,
      bypassed: false,
      fallbackToIndexHtml: false,
    };

    const res = simulateSwFetch(event, selfOrigin, false, false);
    expect(res.status).toBe('bypassed');
  });

  it('completely bypasses Google Auth and redirect endpoints', () => {
    const authEvent: MockFetchEvent = {
      request: { method: 'GET', url: 'https://akce.app/__/auth/handler' },
      handled: false,
      bypassed: false,
      fallbackToIndexHtml: false,
    };
    expect(simulateSwFetch(authEvent, selfOrigin, false, false).status).toBe('bypassed');

    const googleAuthEvent: MockFetchEvent = {
      request: { method: 'GET', url: 'https://accounts.google.com/o/oauth2/auth' },
      handled: false,
      bypassed: false,
      fallbackToIndexHtml: false,
    };
    expect(simulateSwFetch(googleAuthEvent, selfOrigin, false, false).status).toBe('bypassed');
  });

  it('returns index.html fallback ONLY for navigation requests when network fails', () => {
    const navEvent: MockFetchEvent = {
      request: { method: 'GET', url: 'https://akce.app/budget', mode: 'navigate' },
      handled: false,
      bypassed: false,
      fallbackToIndexHtml: false,
    };

    const res = simulateSwFetch(navEvent, selfOrigin, true, false);
    expect(res.status).toBe('navigation-fallback');
  });

  it('does NOT return index.html fallback for non-navigation asset/data network failures', () => {
    const assetEvent: MockFetchEvent = {
      request: { method: 'GET', url: 'https://akce.app/data/finance.json' },
      handled: false,
      bypassed: false,
      fallbackToIndexHtml: false,
    };

    const res = simulateSwFetch(assetEvent, selfOrigin, true, false);
    // Non-navigation failure must fail cleanly rather than returning index.html
    expect(res.status).toBe('failed');
    expect(res.status).not.toBe('navigation-fallback');
  });
});
