// Available in every runtime we target (Node 17+, modern browsers, Capacitor web views),
// but only declared by the DOM lib or @types/node, which the pure engine doesn't include.
declare function structuredClone<T>(value: T): T;
