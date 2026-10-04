/**
 * ติดตั้ง/ถอน Windows Service (เปิดเองอัตโนมัติเมื่อเปิดเครื่อง)
 *   node scripts/service.cjs install [ชื่อบริการ]
 *   node scripts/service.cjs uninstall [ชื่อบริการ]
 *   node scripts/service.cjs restart [ชื่อบริการ]
 */
const path = require("node:path");
const { Service } = require("node-windows");

const [, , cmd, name = "RehabSystem"] = process.argv;
const svc = new Service({
  name,
  description: "ระบบบริหารงานสถานฟื้นฟูสมรรถภาพผู้ติดยาเสพติด",
  script: path.join(__dirname, "server.mjs"),
  workingDirectory: path.resolve(__dirname, ".."),
  nodeOptions: ["--max-old-space-size=2048"],
  wait: 5,
  grow: 0.5,
  maxRestarts: 10,
});

svc.on("install", () => {
  console.log(`ติดตั้งบริการ ${name} แล้ว กำลังเริ่ม...`);
  svc.start();
});
svc.on("alreadyinstalled", () => console.log(`บริการ ${name} ติดตั้งอยู่แล้ว`));
svc.on("start", () => console.log(`บริการ ${name} เริ่มทำงานแล้ว`));
svc.on("uninstall", () => console.log(`ถอนบริการ ${name} แล้ว`));
svc.on("error", (e) => console.error("ผิดพลาด:", e));

if (cmd === "install") svc.install();
else if (cmd === "uninstall") svc.uninstall();
else if (cmd === "restart") svc.restart();
else console.log("ใช้: node scripts/service.cjs install|uninstall|restart [ชื่อบริการ]");
