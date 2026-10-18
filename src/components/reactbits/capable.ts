"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * True only in a browser that has IntersectionObserver (the React Bits effects and motion's useInView need it).
 * False on the server and in test DOMs, where callers render the plain, final content instead: every effect is an
 * optional enhancement and the page reads the same without it.
 */
export function useMotionCapable(): boolean {
  return useSyncExternalStore(
    noop,
    () => typeof IntersectionObserver !== "undefined",
    () => false,
  );
}
