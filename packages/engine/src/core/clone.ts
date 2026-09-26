declare global {
  // Available in every runtime we target (Node 17+, modern browsers, Capacitor web views),
  // but only declared by the DOM lib or @types/node, which the pure engine doesn't include.
  function structuredClone<T>(value: T): T;
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}
