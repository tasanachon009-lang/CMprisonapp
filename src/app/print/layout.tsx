import { documentFontAvailable } from "@/lib/print";
import { PrintToolbar } from "./toolbar";
import "./print.css";

/** หน้าเอกสารพิมพ์ — ไม่มีเมนู ฟอนต์ TH Sarabun New (ถ้ามีไฟล์) */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  const hasFont = documentFontAvailable();
  return (
    <div className={`print-root ${hasFont ? "has-doc-font" : ""}`}>
      <PrintToolbar fontMissing={!hasFont} />
      {children}
    </div>
  );
}
