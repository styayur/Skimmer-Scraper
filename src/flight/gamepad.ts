import { NEUTRAL_INPUT, type FlightInput } from './flightModel';
import { shapeInput, type ControlSettings } from './controlSettings';
import type { GameAction } from './input';

// Chrome on Windows exposes the ShanWan Android/OTG controller without a
// standard mapping. Keep View and Menu in the same slots used by saved controls.
const androidOtgMenuSlots = [10, 11, 8, 9];
const hatDirections: readonly GameAction[] = [
  'navigate-up', 'navigate-up', 'navigate-right', 'navigate-down',
  'navigate-down', 'navigate-down', 'navigate-left', 'navigate-up',
];

export class GamepadInputSource {
  private pressed = new Set<number>();
  private direction: GameAction | undefined;
  private nextDirectionAt = 0;
  private current: Gamepad | null = null;
  private buttonSlots: readonly number[] | undefined;
  private voiceButton = -1;
  private ignoreHeldButtons = false;
  private denied = false;
  public device = 'Keyboard';
  public constructor(private readonly readPads: () => readonly (Gamepad | null)[] = () => navigator.getGamepads?.() ?? []) {}
  public suspend(): void {
    this.current = null;
    this.voiceButton = -1;
    this.direction = undefined;
    this.ignoreHeldButtons = true;
  }
  public poll(settings: ControlSettings, action: (action: GameAction) => void, navigating = false, now = 0): void {
    if (this.denied) return;
    let pad: Gamepad | null;
    try {
      pad = Array.from(this.readPads()).find(value => value?.connected) ?? null;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'SecurityError')) throw error;
      // An embedding document may withhold gamepad permission for this document's lifetime.
      if (this.voiceButton >= 0) action('voice-cancel');
      this.suspend();
      this.denied = true;
      this.device = 'Keyboard';
      return;
    }
    const changed = pad?.index !== this.current?.index || pad?.id !== this.current?.id;
    if (changed) {
      if (this.voiceButton >= 0) action('voice-cancel');
      this.voiceButton = -1;
      this.pressed.clear();
      this.direction = undefined;
      this.buttonSlots = pad && !pad.mapping && /Vendor: 2563 Product: 0526/i.test(pad.id)
        ? androidOtgMenuSlots
        : undefined;
    }
    this.current = pad;
    this.device = pad ? `Gamepad · ${pad.mapping || 'custom'}` : 'Keyboard';
    if (!pad) { this.pressed.clear(); this.ignoreHeldButtons = false; return; }
    if (this.ignoreHeldButtons) {
      this.ignoreHeldButtons = false;
      this.pressed = new Set(pad.buttons.flatMap((button, i) => button.pressed ? [i] : []));
      return;
    }
    const actions: Array<[number, GameAction]> = [[settings.pauseButton, 'pause']];
    if (navigating) actions.push([settings.confirmButton, 'confirm'], [settings.backButton, 'back']);
    actions.push([settings.cameraButton, 'camera'], [settings.retryButton, 'retry'], [settings.menuButton, 'menu']);
    const selected = this.buttonIndex(settings.voiceButton);
    // VID 2563 / PID 0526 exposes its physical left bumper as raw index 6.
    const glideSlot = settings.glideButton < 0 ? (this.buttonSlots ? 6 : 4) : settings.glideButton;
    const glide = this.buttonIndex(glideSlot);
    if (!changed && !navigating && glide !== selected && glide !== this.buttonIndex(settings.boostButton)
      && !actions.some(([slot]) => this.buttonIndex(slot) === glide)) actions.push([glideSlot, 'glide']);
    const canTalk = !navigating && selected >= 0 && selected !== this.buttonIndex(settings.boostButton)
      && !actions.some(([slot]) => this.buttonIndex(slot) === selected);
    if (this.voiceButton >= 0 && (!canTalk || this.voiceButton !== selected || !pad.buttons[selected]?.pressed)) {
      action(canTalk && this.voiceButton === selected ? 'voice-stop' : 'voice-cancel');
      this.voiceButton = -1;
    }
    if (!changed && canTalk && pad.buttons[selected]?.pressed && !this.pressed.has(selected)) {
      this.voiceButton = selected;
      action('voice-start');
    }
    for (const [slot, name] of actions) {
      const button = this.buttonIndex(slot);
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
  private buttonIndex(slot: number): number {
    return this.buttonSlots?.[slot - 8] ?? slot;
  }
  private navigationDirection(pad: Gamepad, settings: ControlSettings): GameAction | undefined {
    if (this.buttonSlots) {
      // The hat reports eight evenly spaced positions and an out-of-range neutral.
      const hat = pad.axes[9];
      if (hat >= -1 && hat <= 1 && hat !== 0) return hatDirections[Math.round((hat + 1) * 3.5)];
    } else {
      for (const [index, direction] of [[12, 'navigate-up'], [13, 'navigate-down'], [14, 'navigate-left'], [15, 'navigate-right']] as const) {
        if (pad.buttons[index]?.pressed) return direction;
      }
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
      boost: (pad.buttons[this.buttonIndex(settings.boostButton)]?.value ?? 0) > 0.35 }, settings, true);
  }
  public impact(): void {
    const actuator = this.current?.vibrationActuator;
    if (!actuator) return;
    try { void actuator.playEffect('dual-rumble', { duration: 70, strongMagnitude: 0.3, weakMagnitude: 0.1 }).catch(() => {}); }
    catch { /* Unsupported haptics never interrupt flight. */ }
  }
}
