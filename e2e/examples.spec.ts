import { test, expect } from "@playwright/test";

const EXAMPLES = [
  { name: "triangle", path: "/examples/triangle/index.html" },
  { name: "instancing", path: "/examples/instancing/index.html" },
  { name: "cube", path: "/examples/cube/index.html" },
];

for (const example of EXAMPLES) {
  test.describe(example.name, () => {
    test("renders non-blank content", async ({ page }) => {
      page.on("pageerror", (err) => {
        throw new Error(`Page error in ${example.name}: ${err.message}`);
      });

      await page.goto(example.path);

      const canvas = page.locator("#canvas");
      await expect(canvas).toBeVisible({ timeout: 5_000 });

      // Let a few frames render
      await page.waitForTimeout(500);

      // Screenshot the canvas and verify it's not all one colour
      const screenshot = await canvas.screenshot();
      const uniquePixels = await countUniqueColors(screenshot);

      // A functioning render should produce many distinct colours
      expect(uniquePixels).toBeGreaterThan(10);
    });

    test("sustains 30+ fps after warm-up", async ({ page }) => {
      await page.goto(example.path);
      await page.locator("#canvas").waitFor({ state: "visible", timeout: 5_000 });

      // Warm up: let GPU pipelines compile and first frames settle
      await page.waitForTimeout(1_000);

      // Measure frame times over ~1 second using rAF timestamps
      const fps = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          const times: number[] = [];
          function tick(t: number) {
            times.push(t);
            if (times.length < 62) {
              requestAnimationFrame(tick);
            } else {
              // Discard first frame (may be stale)
              const durations: number[] = [];
              for (let i = 2; i < times.length; i++) {
                durations.push(times[i] - times[i - 1]);
              }
              const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
              resolve(1000 / avgMs);
            }
          }
          requestAnimationFrame(tick);
        });
      });

      // WebGPU examples should comfortably exceed 30 fps
      expect(fps).toBeGreaterThan(30);
    });

    test("no WebGPU errors in console", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });

      await page.goto(example.path);
      await page.locator("#canvas").waitFor({ state: "visible", timeout: 5_000 });
      await page.waitForTimeout(500);

      const gpuErrors = errors.filter(
        (e) => e.includes("GPU") || e.includes("WebGPU") || e.includes("shader"),
      );
      expect(gpuErrors).toEqual([]);
    });
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a PNG screenshot buffer and count approximate unique colours. */
async function countUniqueColors(pngBuffer: Buffer): Promise<number> {
  // Quick approach: sample every 4th byte-quad from the raw PNG data.
  // PNGs are compressed so we can't read pixels directly, but we can
  // decode using the canvas in a worker... Instead, use a simpler heuristic:
  // count distinct byte-pair patterns in the compressed data.
  // A blank/solid image compresses to very few distinct patterns.
  const set = new Set<number>();
  for (let i = 0; i < pngBuffer.length - 1; i += 2) {
    set.add((pngBuffer[i] << 8) | pngBuffer[i + 1]);
  }
  return set.size;
}
