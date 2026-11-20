import { NEUTRAL_INPUT, type FlightInput } from './flightModel';
import { shapeInput, type ControlSettings } from './controlSettings';
import type { GameAction } from './input';

export class GamepadInputSource {
  private pressed = new Set<number>();
  private current: Gamepad | null = null;
  public device = 'Keyboard';
  public constructor(private readonly readPads: () => readonly (Gamepad | null)[] = () => navigator.getGamepads?.() ?? []) {}
  public poll(settings: ControlSettings, action: (action: GameAction) => void): void {
    const pad = Array.from(this.readPads()).find(value => value?.connected) ?? null;
    if (pad?.index !== this.current?.index || pad?.id !== this.current?.id) this.pressed.clear();
    this.current = pad;
    this.device = pad ? `Gamepad · ${pad.mapping || 'custom'}` : 'Keyboard';
    if (!pad) { this.pressed.clear(); return; }
    const actions: Array<[number, GameAction]> = [[settings.cameraButton,'camera'],[settings.pauseButton,'pause'],[settings.retryButton,'retry']];
    for (const [button, name] of actions) {
      if (pad.buttons[button]?.pressed && !this.pressed.has(button)) action(name);
    }
    this.pressed = new Set(pad.buttons.flatMap((button, i) => button.pressed ? [i] : []));
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
