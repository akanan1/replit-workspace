import type { RequestHandler } from "express";

let inflightCount = 0;
let drained: ((value: void) => void) | null = null;

export const trackInflight: RequestHandler = (_req, res, next) => {
  inflightCount++;
  res.on("close", () => {
    inflightCount--;
    if (inflightCount === 0 && drained) {
      const fn = drained;
      drained = null;
      fn();
    }
  });
  next();
};

export function getInflightCount(): number {
  return inflightCount;
}

/**
 * Wait until every request currently in flight has finished responding,
 * or `timeoutMs` elapses. Returns whether the queue drained cleanly.
 */
export function waitForDrain(timeoutMs: number): Promise<boolean> {
  if (inflightCount === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      drained = null;
      resolve(false);
    }, timeoutMs);
    timer.unref();
    drained = () => {
      clearTimeout(timer);
      resolve(true);
    };
  });
}
