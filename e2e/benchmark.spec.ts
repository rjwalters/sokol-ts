import { test, expect } from "@playwright/test";

test.describe("benchmark", () => {
  test("default draws=1000 renders and reports stats", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/examples/benchmark/index.html?draws=1000");
    await page.locator("#canvas").waitFor({ state: "visible", timeout: 5_000 });

    // Warm up: let the benchmark run for a few seconds
    await page.waitForTimeout(3_000);

    // Read bench stats from the window object
    const bench = await page.evaluate(() => {
      return (window as Record<string, unknown>).__bench as {
        medianMs: number;
        p95Ms: number;
        fps: number;
        drawCalls: number;
      };
    });

    // Verify stats are populated
    expect(bench).toBeDefined();
    expect(bench.drawCalls).toBe(1000);
    expect(bench.fps).toBeGreaterThan(0);
    expect(bench.medianMs).toBeGreaterThan(0);
    expect(bench.p95Ms).toBeGreaterThan(0);

    // No page errors
    expect(errors).toEqual([]);
  });

  test("handles draws=500 (exceeds 256 per-pass limit) without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/examples/benchmark/index.html?draws=500");
    await page.locator("#canvas").waitFor({ state: "visible", timeout: 5_000 });

    await page.waitForTimeout(2_000);

    const bench = await page.evaluate(() => {
      return (window as Record<string, unknown>).__bench as {
        drawCalls: number;
        fps: number;
      };
    });

    expect(bench).toBeDefined();
    expect(bench.drawCalls).toBe(500);
    expect(bench.fps).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("handles draws=1 (minimum) without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/examples/benchmark/index.html?draws=1");
    await page.locator("#canvas").waitFor({ state: "visible", timeout: 5_000 });

    await page.waitForTimeout(1_000);

    const bench = await page.evaluate(() => {
      return (window as Record<string, unknown>).__bench as {
        drawCalls: number;
        fps: number;
      };
    });

    expect(bench).toBeDefined();
    expect(bench.drawCalls).toBe(1);
    expect(errors).toEqual([]);
  });

  test("multiple pipelines parameter works", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/examples/benchmark/index.html?draws=100&pipelines=10");
    await page.locator("#canvas").waitFor({ state: "visible", timeout: 5_000 });

    await page.waitForTimeout(1_500);

    const bench = await page.evaluate(() => {
      return (window as Record<string, unknown>).__bench as {
        drawCalls: number;
        fps: number;
      };
    });

    expect(bench).toBeDefined();
    expect(bench.drawCalls).toBe(100);
    expect(errors).toEqual([]);
  });
});
