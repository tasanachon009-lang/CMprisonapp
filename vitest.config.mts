import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: { TZ: "UTC" }, // เธ—เธ”เธชเธญเธเธงเนเธฒเนเธเนเธ”เนเธกเนเธเธถเนเธ time zone เธเธญเธเน€เธเธฃเธทเนเธญเธ
  },
});
