/**
 * High-precision timing utilities (sokol_time equivalent).
 *
 * All timestamps are `DOMHighResTimeStamp` values in milliseconds
 * (sub-millisecond precision via `performance.now()`). Unit conversion helpers
 * convert outward to the caller's preferred unit, mirroring how `sokol_time.h`
 * stores ticks and converts on read.
 *
 * @example
 * ```ts
 * import { createStm } from "sokol-ts";
 *
 * const stm = createStm();
 * const tick = stm.now();
 * // ... do work ...
 * console.log(stm.ms(stm.since(tick)));   // ms elapsed
 * console.log(stm.sec(stm.elapsed()));    // total seconds since init
 * console.log(stm.fps(gfx.dt));           // smoothed FPS
 * ```
 *
 * @module
 */

/**
 * Timing utility interface returned by {@link createStm}.
 */
export interface Stm {
  /** Snapshot the current high-precision clock. Returns an opaque tick value (ms). */
  now(): number;

  /**
   * Duration between two ticks (absolute value, always >= 0).
   * @param a - First tick value.
   * @param b - Second tick value.
   */
  diff(a: number, b: number): number;

  /**
   * Duration from a past tick to right now (in ms).
   * @param startTick - The earlier tick value.
   */
  since(startTick: number): number;

  /**
   * Lap timer: returns duration since the last call to `laptime()` (or since
   * {@link createStm} was called on the very first invocation). Updates the
   * internal lap-start reference on each call. Useful for per-section profiling.
   *
   * @param prevRef - Optional external reference object. If provided, its `t`
   *   field is read and updated instead of the internal state.
   */
  laptime(prevRef?: { t: number }): number;

  /** Total elapsed time (in ms) since {@link createStm} was called. */
  elapsed(): number;

  /**
   * Convert a duration from milliseconds to seconds.
   * @param d - Duration in milliseconds.
   */
  sec(d: number): number;

  /**
   * Identity conversion (ms to ms). Provided for API symmetry.
   * @param d - Duration in milliseconds.
   */
  ms(d: number): number;

  /**
   * Convert a duration from milliseconds to microseconds.
   * @param d - Duration in milliseconds.
   */
  us(d: number): number;

  /**
   * Convert a duration from milliseconds to nanoseconds.
   * @param d - Duration in milliseconds.
   */
  ns(d: number): number;

  /**
   * Compute smoothed frames-per-second using an N-sample moving average.
   *
   * Call once per frame passing the frame delta in seconds (e.g. `gfx.dt`).
   * Clamps `dtSeconds` to a small epsilon to guard against zero/negative
   * values on the first frame or after tab backgrounding.
   *
   * @param dtSeconds - Frame delta time in seconds.
   * @returns Smoothed frames per second.
   */
  fps(dtSeconds: number): number;
}

// Minimum dt accepted by fps() — prevents division by zero and absorbs
// first-frame spikes caused by the gfx.ts lastFrameTime=0 initialisation.
const MIN_DT = 1e-6; // 1 microsecond expressed in seconds

/**
 * Create a new {@link Stm} timing utility.
 *
 * @param fpsWindowSize - Number of samples for the {@link Stm.fps} moving
 *   average window. Default: 60.
 * @returns A new timing utility instance.
 */
export function createStm(fpsWindowSize = 60): Stm {
  const _initTime = performance.now();
  let _lapStart = _initTime;

  // Circular buffer for fps moving average
  const _window = new Float64Array(fpsWindowSize);
  let _head = 0;
  let _count = 0;
  let _sum = 0;

  return {
    now(): number {
      return performance.now();
    },

    diff(a: number, b: number): number {
      return Math.abs(a - b);
    },

    since(startTick: number): number {
      return Math.max(0, performance.now() - startTick);
    },

    laptime(prevRef?: { t: number }): number {
      const now = performance.now();
      let duration: number;
      if (prevRef !== undefined) {
        // Caller supplies an external reference object; update it in place.
        duration = Math.max(0, now - prevRef.t);
        prevRef.t = now;
      } else {
        // Use internal lap-start state.
        duration = Math.max(0, now - _lapStart);
        _lapStart = now;
      }
      return duration;
    },

    elapsed(): number {
      return Math.max(0, performance.now() - _initTime);
    },

    sec(d: number): number {
      return d / 1000;
    },

    ms(d: number): number {
      return d;
    },

    us(d: number): number {
      return d * 1_000;
    },

    ns(d: number): number {
      return d * 1_000_000;
    },

    fps(dtSeconds: number): number {
      // Clamp to avoid Infinity / NaN from zero or negative dt values.
      const dt = Math.max(dtSeconds, MIN_DT);

      // Evict the oldest sample before inserting the new one.
      _sum -= _window[_head];
      _window[_head] = dt;
      _sum += dt;
      _head = (_head + 1) % fpsWindowSize;
      if (_count < fpsWindowSize) _count++;

      return _count / _sum;
    },
  };
}
