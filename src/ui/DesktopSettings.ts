import { localizeDiagnostic } from '../i18n/diagnostics';
import { t, selectedLocale } from '../i18n';
import { version } from '../../package.json';
import { exportPilot, importPilot } from '../game/pilotSave';

type Invoke = <T>(cmd: string, args?: object) => Promise<T>;
export function bindDesktopSettings(report: (message: string) => void): void {
  const invoke = (window as Window & { __TAURI__?: { core: { invoke: Invoke } } }).__TAURI__?.core.invoke;
  if (!invoke) return;
  const panel = document.querySelector<HTMLDetailsElement>('#desktop-settings')!;
  panel.hidden = false;
  const status = panel.querySelector<HTMLElement>('[role=status]')!;
  const release = panel.querySelector<HTMLButtonElement>('[data-release]')!;
  const check = panel.querySelector<HTMLButtonElement>('[data-check]')!;
  const notes = panel.querySelector<HTMLElement>('[data-notes]')!;
  const environment = panel.querySelector<HTMLElement>('[data-environment]')!;
  const choose = panel.querySelector<HTMLButtonElement>('[data-directory]')!;
  let tag: string | null = null;
  async function refreshEnvironment() {
    const env = await invoke!<{ webview2: string; directory: string }>('desktop_environment');
    environment.textContent = 'WebView2 ' + env.webview2 + ' · ' + env.directory;
  }
  panel.addEventListener('toggle', () => {
    if (panel.open) void refreshEnvironment().catch(() => { environment.textContent = t('desktopSettings.couldNotReadTheWebView2Environment'); });
  });
  check.onclick = async () => {
    check.disabled = true;
    status.textContent = t('desktopSettings.checkingReleases');
    try {
      const latest = await invoke<{ tag: string; notes: string }>('desktop_release');
      tag = latest.tag;
      const current = version.split('.').map(Number);
      const delta = tag.slice(1).split('.').map((n, i) => Number(n) - current[i]!).find(v => v !== 0) ?? 0;
      status.textContent = delta > 0 ? t('desktopSettings.updateAvailable') + tag : t('desktopSettings.latestRelease') + tag + t('desktopSettings.upToDate');
      notes.textContent = localizeDiagnostic(latest.notes);
      notes.parentElement!.hidden = !latest.notes;
    } catch { status.textContent = t('desktopSettings.couldNotReachGitHubTryAgainLater'); }
    finally { check.disabled = false; }
  };
  release.onclick = () => { void invoke('desktop_open_release', { tag }).catch(e => { status.textContent = localizeDiagnostic(String(e)); }); };
  choose.onclick = async () => {
    choose.disabled = true;
    try {
      const path = await invoke<string | null>('desktop_choose_library', { locale: selectedLocale });
      if (path) { await refreshEnvironment(); status.textContent = t('desktopSettings.libraryCopiedToTheSelectedFolder'); }
    } catch (error) { status.textContent = localizeDiagnostic(String(error)); }
    finally { choose.disabled = false; }
  };
  panel.querySelector<HTMLButtonElement>('[data-save-export]')!.onclick = () => {
    const url = URL.createObjectURL(new Blob([exportPilot(localStorage)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'skimmer-pilot.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  const file = panel.querySelector<HTMLInputElement>('input[type=file]')!;
  file.onchange = async () => {
    try {
      const selected = file.files?.[0];
      if (!selected) return;
      if (selected.size > 2 * 1024 ** 2) throw Error(t('desktopSettings.theSaveFileExceedsTheSizeLimit'));
      importPilot(localStorage, await selected.text());
      location.reload();
    } catch (error) { status.textContent = localizeDiagnostic(String(error)); }
    finally { file.value = ''; }
  };
  if (!localStorage.getItem('skimmer-scraper.desktop-welcome.v1')) {
    report(t('desktopSettings.desktopControlsAltEnterTogglesFullscreenAnd'));
    localStorage.setItem('skimmer-scraper.desktop-welcome.v1', '1');
  }
}
