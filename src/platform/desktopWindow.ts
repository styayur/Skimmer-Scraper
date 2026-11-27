interface DesktopWindow {
  isFullscreen(): Promise<boolean>;
  setFullscreen(value: boolean): Promise<void>;
  close(): Promise<void>;
}

interface DesktopHost extends Window {
  __TAURI__?: { window: { getCurrentWindow(): DesktopWindow } };
}

export type PlatformNotice = 'fullscreenUnavailable' | 'pointerLockUnavailable' | 'quitUnavailable';

export function releaseFlightPointer(): void {
  if (document.pointerLockElement?.id === 'game-canvas') document.exitPointerLock();
}

export function bindPlatformWindow(canvas: HTMLCanvasElement, flying: () => boolean, pause: () => void, report: (notice: PlatformNotice) => void): void {
  const desktop = (window as DesktopHost).__TAURI__?.window?.getCurrentWindow();
  const pauseFlight = () => { if (flying()) pause(); };

  if (desktop) {
    const quit = document.querySelector<HTMLButtonElement>('#pause-quit')!;
    quit.hidden = false;
    quit.addEventListener('click', () => void desktop.close().catch(() => report('quitUnavailable')));
  }

  let changingFullscreen = false;
  window.addEventListener('keydown', async event => {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || !event.altKey
      || (event.code !== 'Enter' && event.code !== 'NumpadEnter')) return;
    event.preventDefault();
    if (event.repeat || changingFullscreen) return;
    changingFullscreen = true;
    try {
      if (desktop) {
        const leaving = await desktop.isFullscreen();
        await desktop.setFullscreen(!leaving);
        if (leaving) pauseFlight();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.fullscreenEnabled) {
        // Request during the trusted key event, while transient activation is available.
        await document.documentElement.requestFullscreen();
      } else {
        report('fullscreenUnavailable');
      }
    } catch {
      report('fullscreenUnavailable');
    } finally {
      changingFullscreen = false;
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) pauseFlight();
  });
  // WebView2 can consume physical Escape before dispatching a keyboard event.
  let canvasHadLock = false;
  let requestingLock = false;
  const lockFailed = () => {
    if (requestingLock) report('pointerLockUnavailable');
    requestingLock = false;
  };
  document.addEventListener('pointerlockerror', lockFailed);
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    // A quick release can precede delivery of the acquisition event.
    if (!locked && (canvasHadLock || requestingLock)) pauseFlight();
    requestingLock = false;
    canvasHadLock = locked;
    if (locked && !flying()) releaseFlightPointer();
  });
  canvas.addEventListener('click', async () => {
    if (!flying() || requestingLock || document.pointerLockElement) return;
    requestingLock = true;
    try { await canvas.requestPointerLock(); }
    catch { lockFailed(); }
  });
}
