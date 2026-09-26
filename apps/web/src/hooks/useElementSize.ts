import { useCallback, useState, useSyncExternalStore } from "react";

export interface Size {
  width: number;
  height: number;
}

/**
 * Measures an element as it resizes. Returns a callback ref and the latest size (0×0 until
 * measured, and always in DOMs without ResizeObserver, e.g. very old web views and tests).
 */
export function useElementSize<T extends Element>(): [(node: T | null) => void, Size] {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const ref = useCallback((node: T | null) => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

/** True while the media query matches (e.g. a phone-sized or short screen). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof matchMedia === "undefined") return () => {};
      const list = matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof matchMedia !== "undefined" && matchMedia(query).matches,
    () => false,
  );
}
