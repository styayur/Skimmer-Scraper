import { NEUTRAL_INPUT, type FlightInput } from './flightModel';
import { shapeInput, type ControlSettings } from './controlSettings';
import type { GameAction } from './input';

export class GamepadInputSource {
  private pressed = new Set<number>();
  private direction: GameAction | undefined;
  private nextDirectionAt = 0;
  private current: Gamepad | null = null;
  public device = 'Keyboard';
  public constructor(private readonly readPads: () => readonly (Gamepad | null)[] = () => navigator.getGamepads?.() ?? []) {}
  public poll(settings: ControlSettings, action: (action: GameAction) => void, navigating = false, now = 0): void {
    const pad = Array.from(this.readPads()).find(value => value?.connected) ?? null;
    if (pad?.index !== this.current?.index || pad?.id !== this.current?.id) {
      this.pressed.clear();
      this.direction = undefined;
    }
    this.current = pad;
    this.device = pad ? `Gamepad · ${pad.mapping || 'custom'}` : 'Keyboard';
    if (!pad) { this.pressed.clear(); return; }
    const actions: Array<[number, GameAction]> = [[settings.pauseButton, 'pause']];
    if (navigating) actions.push([settings.confirmButton, 'confirm'], [settings.backButton, 'back']);
    actions.push([settings.cameraButton, 'camera'], [settings.retryButton, 'retry'], [settings.menuButton, 'menu']);
    for (const [button, name] of actions) {
      if (pad.buttons[button]?.pressed && !this.pressed.has(button)) {
        action(name);
        break;
      }
    }
    this.pressed = new Set(pad.buttons.flatMap((button, i) => button.pressed ? [i] : []));
    const direction = navigating ? this.navigationDirection(pad, settings) : undefined;
    if (direction && (direction !== this.direction || now >= this.nextDirectionAt)) {
      this.nextDirectionAt = now + (direction === this.direction ? 135 : 350);
      action(direction);
    }
    this.direction = direction;
  }
  private navigationDirection(pad: Gamepad, settings: ControlSettings): GameAction | undefined {
    for (const [index, direction] of [[12, 'navigate-up'], [13, 'navigate-down'], [14, 'navigate-left'], [15, 'navigate-right']] as const) {
      if (pad.buttons[index]?.pressed) return direction;
    }
    const x = pad.axes[pad.mapping === 'standard' ? 0 : settings.rollAxis] ?? 0;
    const y = pad.axes[pad.mapping === 'standard' ? 1 : settings.pitchAxis] ?? 0;
    if (Math.max(Math.abs(x), Math.abs(y)) < 0.6) return;
    if (Math.abs(y) >= Math.abs(x)) return y < 0 ? 'navigate-up' : 'navigate-down';
    return x < 0 ? 'navigate-left' : 'navigate-right';
  }
  public sample(settings: ControlSettings): FlightInput {
    if (!this.current) return { ...NEUTRAL_INPUT };
    const pad = this.current;
    return shapeInput({ pitch: pad.axes[settings.pitchAxis] ?? 0,
      roll: -(pad.axes[settings.rollAxis] ?? 0), yaw: -(pad.axes[settings.yawAxis] ?? 0),
      boost: (pad.buttons[settings.boostButton]?.value ?? 0) > 0.35 }, settings, true);
  }
  public impact(): void {
    const actuator = this.current?.vibrationActuator;
    if (!actuator) return;
    try { void actuator.playEffect('dual-rumble', { duration: 70, strongMagnitude: 0.3, weakMagnitude: 0.1 }).catch(() => {}); }
    catch { /* Unsupported haptics never interrupt flight. */ }
  }
}
