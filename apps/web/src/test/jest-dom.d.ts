// jest-dom's bundled Vitest typings declare `Assertion<T>`, but Vitest 5 uses
// `Assertion<R, T>`, so the two never merge. This re-applies the matchers with the
// signature Vitest 5 expects. Remove once jest-dom ships Vitest 5 typings.
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "vitest" {
  // Type parameter names must match Vitest's declaration for the interfaces to merge.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<
    R extends void | Promise<void> = void,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    T = unknown,
  > extends TestingLibraryMatchers<unknown, R> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}
