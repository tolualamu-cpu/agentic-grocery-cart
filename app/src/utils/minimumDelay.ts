export const cartBuildMinimumDelayMs = 1_500;

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export async function waitForMinimumDuration<T>(
  work: Promise<T>,
  minimumMs = cartBuildMinimumDelayMs,
  wait = delay,
): Promise<T> {
  let result: T | undefined;
  let error: unknown;

  await Promise.all([
    work.then(
      (value) => {
        result = value;
      },
      (caughtError) => {
        error = caughtError;
      },
    ),
    wait(minimumMs),
  ]);

  if (error) {
    throw error;
  }

  return result as T;
}
