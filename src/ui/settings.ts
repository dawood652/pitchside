// Player settings (camera, graphics, assists), saved in this browser.

export type CamType = 'tele' | 'coop' | 'dynamic' | 'endtoend' | 'pro' | 'broadcast';
export type GraphicsMode = 'auto' | 'performance' | 'quality';
export type SwitchMode = 'auto' | 'loose' | 'manual';

export interface Settings {
  camera: CamType;
  height: number; // 0..20
  zoom: number; // 0..20
  graphics: GraphicsMode;
  autoSwitch: SwitchMode;
  collectAssist: boolean;
  autoSprint: boolean;
  showFps: boolean;
}

const KEY = 'pitchside.settings.v1';

export function defaultSettings(mobile: boolean): Settings {
  return {
    camera: 'tele',
    height: mobile ? 7 : 10,
    zoom: mobile ? 9 : 4,
    graphics: 'auto',
    autoSwitch: 'auto',
    collectAssist: true,
    autoSprint: mobile,
    showFps: false,
  };
}

export function loadSettings(mobile: boolean): Settings {
  const d = defaultSettings(mobile);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...d, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable: defaults */
  }
  return d;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const CAMS: [CamType, string][] = [
  ['tele', 'Tele Broadcast'],
  ['coop', 'Co-op'],
  ['dynamic', 'Dynamic'],
  ['endtoend', 'End to End'],
  ['pro', 'Pro'],
  ['broadcast', 'Broadcast'],
];

/** Settings panel; calls onChange on every edit and onClose when done. */
export function settingsPanel(host: HTMLElement, s: Settings, onChange: (s: Settings) => void, onClose: () => void): void {
  const seg = <T extends string>(id: string, opts: [T, string][], cur: T) =>
    `<div class="seg seg-wrap" id="${id}" role="group">${opts.map(([v, l]) => `<button data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`;
  const render = () => {
    host.innerHTML = `<div class="final settings" role="dialog" aria-label="Settings">
      <h2>Settings</h2>
      <div class="set-row"><label>Camera</label>${seg('cam', CAMS, s.camera)}</div>
      <div class="set-row"><label for="height">Height <b>${s.height}</b></label><input id="height" type="range" min="0" max="20" value="${s.height}"></div>
      <div class="set-row"><label for="zoom">Zoom <b>${s.zoom}</b></label><input id="zoom" type="range" min="0" max="20" value="${s.zoom}"></div>
      <div class="set-row"><label>Graphics</label>${seg<GraphicsMode>('gfx', [['auto', 'Auto'], ['performance', 'Performance'], ['quality', 'Quality']], s.graphics)}</div>
      <div class="set-row"><label>Auto switching</label>${seg<SwitchMode>('sw', [['auto', 'Auto'], ['loose', 'Loose balls'], ['manual', 'Manual']], s.autoSwitch)}</div>
      <div class="set-row"><label>Run to loose balls</label>${seg('col', [['on', 'On'], ['off', 'Off']], s.collectAssist ? 'on' : 'off')}</div>
      <div class="set-row"><label>Auto sprint</label>${seg('as', [['on', 'On'], ['off', 'Off']], s.autoSprint ? 'on' : 'off')}</div>
      <div class="set-row"><label>Show FPS</label>${seg('fps', [['on', 'On'], ['off', 'Off']], s.showFps ? 'on' : 'off')}</div>
      <div class="btns"><button class="primary" id="done">Done</button></div></div>`;
    const bind = (id: string, fn: (v: string) => void) =>
      host.querySelectorAll<HTMLButtonElement>(`#${id} button`).forEach((b) =>
        b.addEventListener('click', () => {
          fn(b.dataset.v!);
          onChange(s);
          render();
        }),
      );
    bind('cam', (v) => (s.camera = v as CamType));
    bind('gfx', (v) => (s.graphics = v as GraphicsMode));
    bind('sw', (v) => (s.autoSwitch = v as SwitchMode));
    bind('col', (v) => (s.collectAssist = v === 'on'));
    bind('as', (v) => (s.autoSprint = v === 'on'));
    bind('fps', (v) => (s.showFps = v === 'on'));
    for (const id of ['height', 'zoom'] as const) {
      const el = host.querySelector<HTMLInputElement>(`#${id}`)!;
      el.addEventListener('input', () => {
        s[id] = Number(el.value);
        (el.previousElementSibling!.querySelector('b') as HTMLElement).textContent = el.value;
        onChange(s);
      });
    }
    host.querySelector('#done')!.addEventListener('click', onClose);
  };
  render();
}
