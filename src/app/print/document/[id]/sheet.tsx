import type { DocView } from "@/lib/docs/view";

/** ช่องตราครุฑ — ยังไม่มีไฟล์ = กรอบประบนจอ (ไม่พิมพ์) เว้นที่ไว้ให้ */
function Garuda({ has, mm }: { has: boolean; mm: number }) {
  const size = { width: `${mm}mm`, height: `${mm}mm` };
  // eslint-disable-next-line @next/next/no-img-element
  return has ? <img className="garuda" src="/doc-assets/garuda.png" alt="ตราครุฑ" style={size} /> : <div className="garuda-empty" style={size}>ยังไม่มี<br />ตราครุฑ</div>;
}

const Field = ({ label, children, small }: { label: string; children: React.ReactNode; small?: boolean }) => (
  <div className={`field ${small ? "small" : ""}`}><b>{label}</b><span className="fill">{children}</span></div>
);

const Body = ({ v }: { v: DocView }) => (
  <div className="body" style={{ marginTop: "4mm" }}>
    {v.paragraphs.map((p, i) => <p key={i} className={/^[0-9๐-๙]+[.)]\s/.test(p) ? "list" : undefined}>{p}</p>)}
  </div>
);

const Sign = ({ v }: { v: DocView }) => (
  <div className="sign">
    {v.closing && <p style={{ marginBottom: "12mm" }}>{v.closing}</p>}
    <p>({v.signerName || "......................................................"})</p>
    <p>{v.signerTitle || "ตำแหน่ง ......................................................"}</p>
  </div>
);

/** เอกสารราชการ 3 รูปแบบ: บันทึกข้อความ / หนังสือภายนอก / คำสั่ง — โครงเดียวกับไฟล์ Word (api/documents/[id]/docx) */
export function DocSheet({ v, hasGaruda }: { v: DocView; hasGaruda: boolean }) {
  if (v.kind === "memo") {
    return (
      <div className="sheet official">
        <div className="memo-head"><Garuda has={hasGaruda} mm={15} /><p className="title">{v.heading}</p></div>
        <Field label="ส่วนราชการ">{v.orgLines[0]}</Field>
        <div style={{ display: "flex", gap: "4mm" }}>
          <div style={{ flex: 1 }}><Field label="ที่">{v.docNo}</Field></div>
          <div style={{ flex: 1 }}><Field label="วันที่">{v.dateText}</Field></div>
        </div>
        <Field label="เรื่อง">{v.subject}</Field>
        <p style={{ marginTop: "2mm" }}>เรียน&nbsp;&nbsp;{v.toLine}</p>
        <Body v={v} />
        <Sign v={v} />
      </div>
    );
  }
  if (v.kind === "order") {
    return (
      <div className="sheet official">
        <div style={{ display: "flex", justifyContent: "center" }}><Garuda has={hasGaruda} mm={30} /></div>
        <p className="center" style={{ marginTop: "2mm" }}>{v.heading}</p>
        <p className="center">ที่ {v.docNo || "............/............"}</p>
        <p className="center">เรื่อง&nbsp;&nbsp;{v.subject}</p>
        <p className="center">____________________</p>
        <Body v={v} />
        <p style={{ textIndent: "25mm", marginTop: "4mm" }}>สั่ง ณ วันที่ {v.dateText || "............................................"}</p>
        <Sign v={v} />
      </div>
    );
  }
  return (
    <div className="sheet official">
      <div style={{ display: "flex", alignItems: "flex-end" }}>
        <p style={{ flex: 1 }}>ที่ {v.docNo}</p>
        <Garuda has={hasGaruda} mm={30} />
        <div style={{ flex: 1, paddingLeft: "12mm" }}>{v.orgLines.map((l, i) => <p key={i}>{l}</p>)}</div>
      </div>
      <p style={{ marginLeft: "50%", marginTop: "4mm" }}>{v.dateText || " "}</p>
      <p style={{ marginTop: "2mm" }}>เรื่อง&nbsp;&nbsp;{v.subject}</p>
      <p style={{ marginTop: "2mm" }}>เรียน&nbsp;&nbsp;{v.toLine || "......................................................"}</p>
      {v.refs.length > 0 && <p style={{ marginTop: "2mm" }}>อ้างถึง&nbsp;&nbsp;{v.refs.join(" · ")}</p>}
      {v.attachments.length > 0 && (
        <div style={{ display: "flex", gap: "2mm", marginTop: "2mm" }}><p style={{ whiteSpace: "nowrap" }}>สิ่งที่ส่งมาด้วย</p><div>{v.attachments.map((a, i) => <p key={i}>{v.attachments.length > 1 ? `${i + 1}. ` : ""}{a}</p>)}</div></div>
      )}
      <Body v={v} />
      <Sign v={v} />
      {v.contact.length > 0 && <div className="contact">{v.contact.map((l, i) => <p key={i}>{l}</p>)}</div>}
    </div>
  );
}
