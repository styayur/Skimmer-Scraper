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
      ...packs.map(({ id, pack }) => {
        const size = pack ? (pack.files.reduce((s, f) => s + f.bytes, 0) / 1048576).toFixed(1) : '';
        const option = new Option(pack ? id + ' · v' + pack.packVersion + ' · ' + size + ' MiB · 安装时已校验'
          : id + ' · 不兼容，建议修复', id);
        option.dataset.compatible = String(!!pack);
        return option;
      }),
    );
    select.disabled = packs.length === 0;
    updateSelection();
    download.textContent = packs.some(p => p.id === 'dragonspine-high-1')
      ? '修复官方 Dragonspine High Pack' : '安装官方 Dragonspine High Pack · 107.5 MiB';
  }
  panel.addEventListener('toggle', () => {
    if (panel.open && !install)
      void refresh().catch(() => {
        status.textContent = '无法读取世界包列表。';
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
    status.textContent = '正在校验…';
    try {
      const bytes = await verifyPack(select.value);
      status.textContent = 'SHA-256 校验通过 · ' + (bytes / 1048576).toFixed(1) + ' MiB';
    } catch (error) { status.textContent = String(error); }
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
      status.textContent = official ? '正在连接 GitHub Release…' : '正在校验…';
      const p = official ? await installOfficialPack(controller.signal, text => { status.textContent = text; })
        : await installPack(file.files!, controller.signal, (n, total) => {
        status.textContent = '已校验 ' + n + ' / ' + total + ' 个分块';
      });
      await refresh();
      select.value = p.id;
      status.textContent = '资源包安装完成。';
    } catch (e) {
      status.textContent = controller.signal.aborted
        ? '安装已取消。'
        : String(e);
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
      status.textContent = '资源包已移除。';
    } catch (e) {
      status.textContent = String(e);
    }
  };
  open.onclick = async () => {
    try {
      const pack = (await installedPacks()).find((p) => p.id === select.value);
      if (!pack) return;
      localStorage.setItem(activePackKey, pack.id);
      const url = new URL(location.href);
      url.search = '';
      url.searchParams.set('theme', 'dragon');
      url.searchParams.set('seed', String(pack.seed));
      url.searchParams.set('gen', '4');
      location.assign(url.href);
    } catch (e) {
      status.textContent = String(e);
    }
  };
}
