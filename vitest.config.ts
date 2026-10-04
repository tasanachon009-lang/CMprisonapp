import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: { TZ: "UTC" }, // ทดสอบว่าโค้ดไม่พึ่ง time zone ของเครื่อง
  },
});
