import { afterEach, describe, expect, it, vi } from "vitest";
import { cartBuildMinimumDelayMs, waitForMinimumDuration } from "@/utils/minimumDelay";

describe("minimum delay helper", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits at least the cart build loading duration before resolving fast work", async () => {
    vi.useFakeTimers();
    let settled = false;

    const delayed = waitForMinimumDuration(Promise.resolve("done")).then((value) => {
      settled = true;
      return value;
    });

    await vi.advanceTimersByTimeAsync(cartBuildMinimumDelayMs - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(delayed).resolves.toBe("done");
    expect(settled).toBe(true);
  });

  it("waits for slow work even after the minimum duration has elapsed", async () => {
    vi.useFakeTimers();
    let resolveWork: (value: string) => void = () => undefined;
    const work = new Promise<string>((resolve) => {
      resolveWork = resolve;
    });
    let settled = false;

    const delayed = waitForMinimumDuration(work).then((value) => {
      settled = true;
      return value;
    });

    await vi.advanceTimersByTimeAsync(cartBuildMinimumDelayMs + 500);
    expect(settled).toBe(false);

    resolveWork("slow done");
    await expect(delayed).resolves.toBe("slow done");
    expect(settled).toBe(true);
  });

});
