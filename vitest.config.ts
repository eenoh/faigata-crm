import { defineConfig } from "vitest/config";
import path from "node:path";

const rootDir = path.resolve(__dirname);

export default defineConfig({
  root: rootDir,
  test: {
    environment: "node",
    globals: true,
    dir: path.join(rootDir, "tests", "unit"),
    include: ["**/*.test.{ts,tsx}"],
    setupFiles: [path.join(rootDir, "tests", "support", "setup-env.ts")],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.join(rootDir, "src"),
      "server-only": path.join(rootDir, "tests", "support", "server-only.ts"),
    },
  },
  server: {
    fs: {
      allow: [rootDir],
    },
  },
});
