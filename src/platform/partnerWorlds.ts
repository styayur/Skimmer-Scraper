import { t } from '../i18n';
import { WORLD_IMPORT_LIMITS } from '../world/imports/worldManifest';

export interface PartnerWorld {
  id: string;
  label: 'partner.relay' | 'partner.contact' | 'partner.switchyard';
  source: string;
  inspector: string;
  bytes: number;
  sha256: string;
}

const original = 'https://raw.githubusercontent.com/styayur/V2Wpro/7eb42fd3db2693989db7d3626101ed1b6e92e533/examples/';
const inspector = 'https://styayur.github.io/V2Wpro/?world=';

export const partnerWorlds: readonly PartnerWorld[] = [
  { id: 'relay-district', label: 'partner.relay', source: original + 'district.glb', inspector: inspector + 'district',
    bytes: 18928, sha256: 'a707d463ce3279c9517d51b3dccde296c461eea2131b214315923b58b4f383d0' },
  { id: 'contact-deck', label: 'partner.contact', source: original + 'contact.glb', inspector: inspector + 'contact',
    bytes: 72744, sha256: '243949bbceae959ee58da971859bd5f614bf4b2f30ae7e5cf711fb3f597d89f3' },
  { id: 'switchyard', label: 'partner.switchyard',
    source: 'https://raw.githubusercontent.com/styayur/V2Wpro/43cbe696592ce7bbab17140cbb8c6fc6a07478e9/examples/topogenesis.glb',
    inspector: inspector + 'topogenesis', bytes: 436240,
    sha256: '3c2565ea3e0aac99cf553e0b774569d0e0c72395458e42c2e2cea9dbc95e8027' },
];

export function partnerFromSearch(search: string): PartnerWorld | undefined {
  const id = new URLSearchParams(search).get('catalog');
  return partnerWorlds.find(world => world.id === id);
}

/** The stock importer checks the catalog digest before it preflights and decodes the GLB. */
export async function downloadPartnerWorld(world: PartnerWorld, signal: AbortSignal): Promise<ArrayBuffer> {
  if (!Number.isSafeInteger(world.bytes) || world.bytes < 20 || world.bytes > WORLD_IMPORT_LIMITS.bytes) {
    throw Error(t('partner.wrongLength'));
  }
  const response = await fetch(world.source, {
    method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal,
  });
  if (!response.ok || !response.body) throw Error(t('partner.unavailable'));
  const declared = response.headers.get('Content-Length');
  const reader = response.body.getReader();
  try {
    // Compressed HTTP lengths describe the wire representation. Always bound the decoded stream.
    if (declared !== null && !response.headers.get('Content-Encoding') && Number(declared) !== world.bytes) {
      throw Error(t('partner.wrongLength'));
    }
    const data = new Uint8Array(world.bytes);
    let offset = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.length > data.length - offset) throw Error(t('partner.wrongLength'));
      data.set(value, offset);
      offset += value.length;
    }
    if (offset !== data.length) throw Error(t('partner.wrongLength'));
    return data.buffer;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
