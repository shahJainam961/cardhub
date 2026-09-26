import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "server",
    environment: "node",
    // Colyseus's test server always listens on the same port, so room test files run one at a time.
    fileParallelism: false,
  },
});
