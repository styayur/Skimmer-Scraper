export interface FixedStepResult {
  steps: number;
  alpha: number;
  droppedSeconds: number;
}

/** Deterministic accumulator for frame-rate independent simulation. */
export class FixedStepRunner {
  private accumulator = 0;

  public constructor(
    public readonly stepSeconds: number,
    private readonly maxSteps: number = 12,
  ) {
    if (!(stepSeconds > 0)) throw new Error('stepSeconds must be positive.');
    if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error('maxSteps must be a positive integer.');
  }

  public get pending(): number {
    return this.accumulator;
  }

  public advance(frameDelta: number, step: (dt: number) => boolean | void): FixedStepResult {
    const delta = Number.isFinite(frameDelta) ? Math.max(0, frameDelta) : 0;
    this.accumulator += delta;
    let steps = 0;

    while (this.accumulator + 1e-9 >= this.stepSeconds && steps < this.maxSteps) {
      if (step(this.stepSeconds) === false) break;
      this.accumulator -= this.stepSeconds;
      steps += 1;
    }

    let droppedSeconds = 0;
    if (this.accumulator > this.stepSeconds * this.maxSteps) {
      droppedSeconds = this.accumulator - this.stepSeconds * this.maxSteps;
      this.accumulator = this.stepSeconds * this.maxSteps;
    }

    return {
      steps,
      alpha: this.accumulator / this.stepSeconds,
      droppedSeconds,
    };
  }

  public reset(): void {
    this.accumulator = 0;
  }
}
