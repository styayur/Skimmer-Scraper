import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadPartnerWorld, partnerFromSearch, partnerWorlds } from '../../src/platform/partnerWorlds';
import { WORLD_IMPORT_LIMITS } from '../../src/world/imports/worldManifest';
import desktop from '../../src-tauri/tauri.conf.json';

const world = partnerWorlds[0]!;
const signal = new AbortController().signal;
afterEach(() => vi.unstubAllGlobals());

describe('confirmed partner downloads', () => {
  it('limits the desktop connection permission to the pinned producer repository path', () => {
    const directive = desktop.app.security.csp.split(';').find(item => item.trim().startsWith('connect-src'))!;
    const paths = directive.split(/\s+/).filter(host => host.includes('raw.githubusercontent.com'));
    expect(paths).toEqual(['https://raw.githubusercontent.com/styayur/V2Wpro/']);
    expect(partnerWorlds.every(world => world.source.startsWith(paths[0]!))).toBe(true);
  });
  it('resolves only catalog IDs and never dereferences a URL from a link', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(partnerFromSearch('?catalog=contact-deck')?.id).toBe('contact-deck');
    expect(partnerFromSearch('?catalog=https%3A%2F%2Fexample.com')).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(0);
  });

  it('bounds each decoded chunk, including responses with a missing or misleading length', async () => {
    for (const [body, headers] of [
      [world.bytes - 1, {}], [world.bytes + 1, {}], [world.bytes, { 'Content-Length': '1' }],
      [world.bytes + 1, { 'Content-Length': String(world.bytes) }],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(body), { headers: { ...headers } })));
      await expect(downloadPartnerWorld(world, signal)).rejects.toThrow();
    }
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(downloadPartnerWorld({ ...world, bytes: WORLD_IMPORT_LIMITS.bytes + 1 }, signal)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(0);
  });

  it('gets exactly the confirmed bytes without credentials, referrer or redirects', async () => {
    const bytes = new Uint8Array(world.bytes).fill(37);
    const fetch = vi.fn(async () => new Response(bytes));
    vi.stubGlobal('fetch', fetch);
    expect(new Uint8Array(await downloadPartnerWorld(world, signal))).toEqual(bytes);
    expect(fetch).toHaveBeenCalledWith(world.source, { signal, credentials: 'omit',
      method: 'GET', redirect: 'error', referrerPolicy: 'no-referrer' });
  });
});
