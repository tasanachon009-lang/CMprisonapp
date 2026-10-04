export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // migration ทำตอนเปิดฐานข้อมูล; ข้อมูลอ้างอิงใหม่ของเวอร์ชันนี้ (เช่น แบบประเมิน) เติมให้โดยไม่ทับค่าที่ผู้ใช้แก้
    const { getDb } = await import("./lib/db");
    const { bootstrapReferenceData } = await import("./lib/bootstrap");
    bootstrapReferenceData(getDb());
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
