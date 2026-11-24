import {
  installedPacks,
  installPack,
  installOfficialPack,
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
  async function refresh() {
    const packs = await installedPacks();
    select.replaceChildren(
      ...packs.map(
        (p) =>
          new Option(
            p.id + ' · v' + p.packVersion + ' · 安装时已校验' +
              ' · ' +
              (p.files.reduce((s, f) => s + f.bytes, 0) / 1048576).toFixed(1) +
              ' MiB',
            p.id,
          ),
      ),
    );
    open.disabled = remove.disabled = select.disabled = verify.disabled = packs.length === 0;
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
      open.disabled = remove.disabled = verify.disabled = select.options.length === 0;
      file.value = '';
      cancel.hidden = true;
      install = null;
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
