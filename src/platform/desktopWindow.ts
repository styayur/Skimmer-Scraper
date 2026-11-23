interface DesktopWindow {
  isFullscreen(): Promise<boolean>;
  setFullscreen(value: boolean): Promise<void>;
}

interface DesktopHost extends Window {
  __TAURI__?: { window: { getCurrentWindow(): DesktopWindow } };
}

export function bindDesktopWindow(canvas: HTMLCanvasElement, flying: () => boolean, pause: () => void, report: (message: string) => void): void {
  const desktop = (window as DesktopHost).__TAURI__?.window.getCurrentWindow();
  if (!desktop) return;

  let changingFullscreen = false;
  window.addEventListener('keydown', async event => {
    if (!event.altKey || event.code !== 'Enter') return;
    event.preventDefault();
    if (event.repeat || changingFullscreen) return;
    changingFullscreen = true;
    try {
      await desktop.setFullscreen(!await desktop.isFullscreen());
    } catch {
      report('无法切换全屏。');
    } finally {
      changingFullscreen = false;
    }
  });
  window.addEventListener('blur', () => {
    if (flying()) pause();
  });
  // WebView2 consumes the first physical Escape itself when the pointer is locked.
  let canvasHadLock = false;
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    const released = canvasHadLock && !locked;
    canvasHadLock = locked;
    if (released && flying()) pause();
  });
  canvas.addEventListener('click', () => {
    if (flying() && !document.pointerLockElement) {
      void canvas.requestPointerLock().catch(() => report('无法锁定鼠标。'));
    }
  });
}
