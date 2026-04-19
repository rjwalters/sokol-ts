import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStm } from "../src/stm.js";

describe("createStm", () => {
  // ---------------------------------------------------------------------------
  // now()
  // ---------------------------------------------------------------------------
  describe("now()", () => {
    it("returns a positive number from performance.now()", () => {
      const stm = createStm();
      const t = stm.now();
      expect(t).toBeGreaterThan(0);
      expect(typeof t).toBe("number");
    });

    it("returns monotonically increasing values", () => {
      const stm = createStm();
      const a = stm.now();
      const b = stm.now();
      expect(b).toBeGreaterThanOrEqual(a);
    });
  });

  // ---------------------------------------------------------------------------
  // diff()
  // ---------------------------------------------------------------------------
  describe("diff()", () => {
    it("returns the absolute difference between two ticks", () => {
      const stm = createStm();
      expect(stm.diff(100, 50)).toBe(50);
      expect(stm.diff(50, 100)).toBe(50);
    });

    it("returns 0 for identical ticks", () => {
      const stm = createStm();
      expect(stm.diff(42, 42)).toBe(0);
    });

    it("handles very small differences", () => {
      const stm = createStm();
      expect(stm.diff(1.0001, 1.0)).toBeCloseTo(0.0001, 4);
    });
  });

  // ---------------------------------------------------------------------------
  // since()
  // ---------------------------------------------------------------------------
  describe("since()", () => {
    it("returns a non-negative duration from a past tick", () => {
      const stm = createStm();
      const tick = stm.now();
      const elapsed = stm.since(tick);
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });

    it("returns 0 or positive for a future tick (clamped)", () => {
      const stm = createStm();
      // A tick far in the future should still return >= 0 due to Math.max(0, ...)
      const futureTick = performance.now() + 999999;
      expect(stm.since(futureTick)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // laptime()
  // ---------------------------------------------------------------------------
  describe("laptime()", () => {
    it("returns non-negative duration on first call (internal ref)", () => {
      const stm = createStm();
      const lap = stm.laptime();
      expect(lap).toBeGreaterThanOrEqual(0);
    });

    it("updates internal state across successive calls", () => {
      const stm = createStm();
      const lap1 = stm.laptime();
      const lap2 = stm.laptime();
      // Both should be non-negative
      expect(lap1).toBeGreaterThanOrEqual(0);
      expect(lap2).toBeGreaterThanOrEqual(0);
    });

    it("uses external ref when provided", () => {
      const stm = createStm();
      const ref = { t: performance.now() };
      const lap = stm.laptime(ref);
      expect(lap).toBeGreaterThanOrEqual(0);
      // ref.t should have been updated to a more recent time
      expect(ref.t).toBeGreaterThanOrEqual(0);
    });

    it("updates external ref.t in place", () => {
      const stm = createStm();
      const initialT = performance.now();
      const ref = { t: initialT };
      stm.laptime(ref);
      // ref.t should now be >= initialT
      expect(ref.t).toBeGreaterThanOrEqual(initialT);
    });
  });

  // ---------------------------------------------------------------------------
  // elapsed()
  // ---------------------------------------------------------------------------
  describe("elapsed()", () => {
    it("returns non-negative duration since createStm()", () => {
      const stm = createStm();
      expect(stm.elapsed()).toBeGreaterThanOrEqual(0);
    });

    it("increases over time", () => {
      const stm = createStm();
      const e1 = stm.elapsed();
      const e2 = stm.elapsed();
      expect(e2).toBeGreaterThanOrEqual(e1);
    });
  });

  // ---------------------------------------------------------------------------
  // Unit conversions
  // ---------------------------------------------------------------------------
  describe("unit conversions", () => {
    it("sec() divides by 1000", () => {
      const stm = createStm();
      expect(stm.sec(1000)).toBe(1);
      expect(stm.sec(500)).toBe(0.5);
      expect(stm.sec(0)).toBe(0);
    });

    it("ms() is identity", () => {
      const stm = createStm();
      expect(stm.ms(42)).toBe(42);
      expect(stm.ms(0)).toBe(0);
      expect(stm.ms(1.5)).toBe(1.5);
    });

    it("us() multiplies by 1000", () => {
      const stm = createStm();
      expect(stm.us(1)).toBe(1000);
      expect(stm.us(0.5)).toBe(500);
      expect(stm.us(0)).toBe(0);
    });

    it("ns() multiplies by 1_000_000", () => {
      const stm = createStm();
      expect(stm.ns(1)).toBe(1_000_000);
      expect(stm.ns(0.001)).toBe(1000);
      expect(stm.ns(0)).toBe(0);
    });

    it("round-trips: sec -> ms -> us -> ns chain", () => {
      const stm = createStm();
      const ms = 250;
      expect(stm.sec(ms)).toBe(0.25);
      expect(stm.ms(ms)).toBe(250);
      expect(stm.us(ms)).toBe(250_000);
      expect(stm.ns(ms)).toBe(250_000_000);
    });
  });

  // ---------------------------------------------------------------------------
  // fps()
  // ---------------------------------------------------------------------------
  describe("fps()", () => {
    it("returns correct FPS for steady 60fps (dt = 1/60)", () => {
      const stm = createStm(4); // small window for test clarity
      const dt = 1 / 60;
      // Fill the window
      for (let i = 0; i < 4; i++) stm.fps(dt);
      const result = stm.fps(dt);
      // After wrapping, the window should contain 4 samples of dt
      expect(result).toBeCloseTo(60, 0);
    });

    it("returns correct FPS for steady 30fps (dt = 1/30)", () => {
      const stm = createStm(4);
      const dt = 1 / 30;
      for (let i = 0; i < 10; i++) stm.fps(dt);
      expect(stm.fps(dt)).toBeCloseTo(30, 0);
    });

    it("clamps zero dt to MIN_DT (no Infinity)", () => {
      const stm = createStm(4);
      const result = stm.fps(0);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThan(0);
    });

    it("clamps negative dt to MIN_DT (no Infinity/NaN)", () => {
      const stm = createStm(4);
      const result = stm.fps(-1);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThan(0);
    });

    it("smooths a spike over the window", () => {
      const windowSize = 4;
      const stm = createStm(windowSize);
      const normalDt = 1 / 60;

      // Fill with normal frames
      for (let i = 0; i < windowSize; i++) stm.fps(normalDt);

      // Inject a spike (200ms frame)
      const afterSpike = stm.fps(0.2);

      // FPS should be dragged down by the spike but not to 5 fps (1/0.2)
      // because the window still has normal samples
      expect(afterSpike).toBeGreaterThan(5);
      expect(afterSpike).toBeLessThan(60);
    });

    it("handles custom window size", () => {
      const stm = createStm(2);
      const dt = 1 / 120;
      stm.fps(dt);
      stm.fps(dt);
      const result = stm.fps(dt);
      // Window of 2, so only the last 2 samples matter
      expect(result).toBeCloseTo(120, 0);
    });

    it("first call returns a valid FPS", () => {
      const stm = createStm();
      const result = stm.fps(1 / 60);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThan(0);
    });
  });
});
