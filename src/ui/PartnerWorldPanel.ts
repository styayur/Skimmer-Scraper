import { t } from '../i18n';
import { partnerFromSearch, partnerWorlds, type PartnerWorld } from '../platform/partnerWorlds';

/** A catalog link selects a source. Only an explicit import click can fetch its bytes. */
export function bindPartnerWorlds(load: (world: PartnerWorld) => Promise<void>): boolean {
  const panel = document.querySelector<HTMLDetailsElement>('#partner-world-catalog')!;
  // Desktop has its own pack manager and network policy. Its local GLB importer is always available.
  if ('__TAURI__' in window) { panel.hidden = true; return false; }
  const select = panel.querySelector('select')!;
  const confirm = panel.querySelector('button')!;
  const link = panel.querySelector<HTMLAnchorElement>('#partner-world-inspect')!;
  const playLink = panel.querySelector<HTMLAnchorElement>('#partner-world-play-link')!;
  const source = panel.querySelector<HTMLElement>('#partner-world-source')!;
  const pin = panel.querySelector<HTMLElement>('#partner-world-pin')!;
  const details = pin.closest('details')!;
  const requested = new URLSearchParams(location.search).get('catalog');
  const selected = partnerFromSearch(location.search);
  const hasKineticCity = !!document.querySelector('#world-theme option[value="kinetic-city"]');
  select.replaceChildren(...partnerWorlds.map(world => new Option(t(world.label), world.id)));
  if (hasKineticCity || requested === 'kinetic-city') select.add(new Option(t('partner.kinetic'), 'kinetic-city'));
  if (selected || requested === 'kinetic-city') select.value = requested!;
  function update() {
    const world = partnerWorlds.find(w => w.id === select.value);
    playLink.href = '?catalog=' + encodeURIComponent(select.value);
    confirm.hidden = details.hidden = !world;
    link.hidden = !world && !hasKineticCity;
    if (world) {
      source.textContent = t('partner.from', { host: new URL(world.source).host, bytes: world.bytes });
      pin.textContent = world.source + ' · SHA-256 ' + world.sha256;
      link.textContent = t('partner.inspect');
      link.href = world.inspector;
      link.target = '_blank';
    } else {
      source.textContent = t(hasKineticCity ? 'partner.procedural' : 'partner.requiresCity');
      link.textContent = t('ui.enterWorld');
      link.href = '?theme=kinetic-city';
      link.target = '_self';
    }
  }
  select.addEventListener('change', update);
  confirm.addEventListener('click', async () => {
    const world = partnerWorlds.find(w => w.id === select.value);
    if (!world) return;
    select.disabled = confirm.disabled = true;
    try { await load(world); }
    finally { select.disabled = confirm.disabled = false; }
  });
  update();
  panel.open = !!selected || requested === 'kinetic-city';
  return panel.open;
}
