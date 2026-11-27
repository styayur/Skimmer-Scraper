import { localizeDiagnostic } from '../i18n/diagnostics';
import { t } from '../i18n';
import {
  installedPacks,
  installPack,
  installOfficialPack,
  libraryPacks,
  nativePacksAvailable,
  removePack,
  verifyPack,
} from '../platform/worldPacks';

const activePackKey = 'skimmer-scraper.active-pack';

export function bindPackPanel(): void {
  const panel = document.querySelector<HTMLDetailsElement>('#world-packs')!;
  if (!nativePacksAvailable()) return;
  panel.hidden = false;
  const file = panel.querySelector<HTMLInputElement>('input[type=file]')!;
  const select = panel.querySelector('select')!;
  const status = panel.querySelector<HTMLElement>('[role=status]')!;
  const open = panel.querySelector<HTMLButtonElement>('[data-pack-open]')!;
  const remove = panel.querySelector<HTMLButtonElement>('[data-pack-remove]')!;
  const cancel = panel.querySelector<HTMLButtonElement>('[data-pack-cancel]')!;
  const download = panel.querySelector<HTMLButtonElement>('[data-pack-download]')!;
  const verify = panel.querySelector<HTMLButtonElement>('[data-pack-verify]')!;
  let install: AbortController | null = null;
  const updateSelection = () => {
    const compatible = select.selectedOptions[0]?.dataset.compatible === 'true';
    open.disabled = !compatible || !!install;
    verify.disabled = remove.disabled = !select.value || !!install;
  };
  select.onchange = updateSelection;
  async function refresh() {
    const packs = await libraryPacks();
    select.replaceChildren(
      ...packs.map(({ id, pack, retired }) => {
        const size = pack ? (pack.files.reduce((s, f) => s + f.bytes, 0) / 1048576).toFixed(1) : '';
        const label = pack ? 'Dragonspine · ' + pack.tier + ' · ' + pack.seed + ' · v' + pack.packVersion + ' · ' + size + ' MiB'
          : retired ? id + t('worldPackPanel.legacyMapOpenInV082')
          : id + t('worldPackPanel.incompatibleRepairRecommended');
        const option = new Option(label, id);
        option.dataset.compatible = String(!!pack);
        return option;
      }),
    );
    select.disabled = packs.length === 0;
    updateSelection();
    download.textContent = packs.some(p => p.pack?.tier === 'high' && p.pack.seed === 334458)
      ? t('worldPackPanel.repairOfficialDragonspineHighPack') : t('ui.installOfficialDragonspineHighPack');
  }
  panel.addEventListener('toggle', () => {
    if (panel.open && !install)
      void refresh().catch(() => {
        status.textContent = t('worldPackPanel.couldNotReadTheWorldPackList');
      });
  });
  cancel.onclick = () => install?.abort();
  panel.querySelector<HTMLButtonElement>('[data-pack-imports]')!.onclick = () => {
    const library = document.querySelector<HTMLDetailsElement>('#local-world-library')!;
    library.open = true;
    library.scrollIntoView({ block: 'nearest' });
    library.querySelector('summary')!.focus();
  };
  verify.onclick = async () => {
    verify.disabled = true;
    status.textContent = t('worldPackPanel.verifying');
    try {
      const bytes = await verifyPack(select.value);
      status.textContent = t('worldPackPanel.sha256Verified') + (bytes / 1048576).toFixed(1) + ' MiB';
    } catch (error) { status.textContent = localizeDiagnostic(String(error)); }
    finally { verify.disabled = install !== null || !select.options.length; }
  };
  async function startInstall(official: boolean) {
    if ((!official && !file.files?.length) || install) return;
    const controller = new AbortController();
    install = controller;
    file.disabled = true;
    download.disabled = remove.disabled = open.disabled = verify.disabled = true;
    cancel.hidden = false;
    try {
      status.textContent = official ? t('worldPackPanel.connectingToGitHubReleases') : t('worldPackPanel.verifying');
      const p = official ? await installOfficialPack(controller.signal, text => { status.textContent = localizeDiagnostic(text); })
        : await installPack(file.files!, controller.signal, (n, total) => {
        status.textContent = t('worldPackPanel.verified') + n + ' / ' + total + t('worldPackPanel.chunks');
      });
      await refresh();
      select.value = p.id;
      status.textContent = t('worldPackPanel.packInstalled');
    } catch (e) {
      status.textContent = controller.signal.aborted
        ? t('worldPackPanel.installationCancelled')
        : localizeDiagnostic(String(e));
    } finally {
      file.disabled = false;
      download.disabled = false;
      file.value = '';
      cancel.hidden = true;
      install = null;
      updateSelection();
    }
  }
  file.onchange = () => { void startInstall(false); };
  download.onclick = () => { void startInstall(true); };
  remove.onclick = async () => {
    try {
      await removePack(select.value);
      await refresh();
      status.textContent = t('worldPackPanel.packRemoved');
    } catch (e) {
      status.textContent = localizeDiagnostic(String(e));
    }
  };
  open.onclick = async () => {
    try {
      const pack = (await installedPacks()).find((p) => p.id === select.value);
      if (!pack) return;
      localStorage.setItem(activePackKey, pack.id);
      const url = new URL(location.href);
      url.search = '';
      url.searchParams.set('theme', 'dragonspine');
      url.searchParams.set('seed', String(pack.seed));
      url.searchParams.set('gen', '4');
      location.assign(url.href);
    } catch (e) {
      status.textContent = localizeDiagnostic(String(e));
    }
  };
}
