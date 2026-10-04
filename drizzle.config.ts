import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  // ใช้สร้างไฟล์ migration เท่านั้น — การใช้ migration จริงทำผ่าน scripts/migrate.ts
  dbCredentials: { url: "./data/dev-drizzle-kit.db" },
});
