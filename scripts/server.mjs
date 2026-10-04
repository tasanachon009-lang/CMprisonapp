/**
 * เซิร์ฟเวอร์ใช้จริง: HTTPS บน LAN (Windows Service เรียกไฟล์นี้)
 *   node scripts/server.mjs
 * อ่านค่าจาก .env: PORT, HTTPS_PFX (+HTTPS_PFX_PASSPHRASE) หรือ HTTPS_CERT/HTTPS_KEY
 */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import { fileURLToPath } from "node:url";
import next from "next";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (fs.existsSync(".env")) process.loadEnvFile(".env");
process.env.NODE_ENV = "production";
process.env.NEXT_TELEMETRY_DISABLED = "1"; // ห้ามส่งข้อมูลออกนอกหน่วยงาน

const port = Number(process.env.PORT ?? 443);
const tls = process.env.HTTPS_PFX
  ? { pfx: fs.readFileSync(process.env.HTTPS_PFX), passphrase: process.env.HTTPS_PFX_PASSPHRASE ?? "" }
  : { cert: fs.readFileSync(process.env.HTTPS_CERT), key: fs.readFileSync(process.env.HTTPS_KEY) };

const app = next({ dev: false, dir: root });
const handle = app.getRequestHandler();
await app.prepare();

const server = https.createServer({ ...tls, minVersion: "TLSv1.2" }, (req, res) => {
  // IP จริงของเครื่องลูกข่าย (ไม่เชื่อ header ที่ส่งมาจากภายนอก)
  delete req.headers["x-forwarded-for"];
  delete req.headers["x-forwarded-host"];
  req.headers["x-real-ip"] = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  res.setHeader("Strict-Transport-Security", "max-age=31536000");
  handle(req, res);
});
server.listen(port, "0.0.0.0", () => console.log(`[rehab] พร้อมใช้งานที่ https://<ชื่อเครื่อง>:${port} (${process.env.APP_ENV ?? "production"})`));

// พอร์ต 80 → พาไป HTTPS (เฉพาะเมื่อใช้พอร์ต 443)
if (port === 443 && process.env.HTTP_REDIRECT !== "false") {
  http
    .createServer((req, res) => {
      res.writeHead(301, { Location: `https://${(req.headers.host ?? "").replace(/:\d+$/, "")}${req.url ?? "/"}` });
      res.end();
    })
    .listen(80, "0.0.0.0")
    .on("error", () => console.warn("[rehab] เปิดพอร์ต 80 ไม่ได้ (ไม่เป็นไร ใช้ https:// ตรงๆ)"));
}

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
