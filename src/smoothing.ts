/** Frame-rate-independent exponential smoothing for tracker parameters. */
export class ExponentialSmoother {
  private value: number | undefined

  constructor(private readonly timeConstantMs: number) {
    if (!Number.isFinite(timeConstantMs) || timeConstantMs < 0) {
      throw new Error('smoothing time constant must be a finite non-negative number')
    }
  }

  next(target: number, deltaMs: number): number {
    if (!Number.isFinite(target)) throw new Error('smoothing target must be finite')
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new Error('smoothing delta must be a finite non-negative number')
    }
    if (this.value === undefined || this.timeConstantMs === 0) {
      this.value = target
      return this.value
    }
    const alpha = 1 - Math.exp(-deltaMs / this.timeConstantMs)
    this.value += (target - this.value) * alpha
    return this.value
  }

  reset(): void {
    this.value = undefined
  }
}
