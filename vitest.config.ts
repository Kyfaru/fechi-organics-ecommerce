import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `import "server-only"` throws outside a React Server Component, which
      // is the whole point in the app but breaks any test importing a
      // server-only module. Next resolves it to an empty module under its
      // server condition; do the same here.
      // Resolved to the file directly: the package's `exports` field does not
      // expose ./empty.js under vitest's conditions, so a bare specifier fails.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
      // Stub CSS imports from node_modules so jsdom doesn't choke on them
      "react-phone-number-input/style.css": path.resolve(
        __dirname,
        "__tests__/__mocks__/empty.css"
      ),
    },
  },
});
