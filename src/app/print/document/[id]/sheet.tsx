import type { DocView, Annex } from "@/lib/docs/view";

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
    {v.parts.map((p, i) => <p key={i} className={p.type === "text" ? undefined : p.type}>{p.text}</p>)}
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
/**
 * แม่แบบบันทึกข้อความกลาง (สเปก 18.3A) — ทุกบันทึกข้อความในระบบใช้ตัวนี้ (เอกสาร 18.4, รายงานประจำสัปดาห์/เดือน)
 * โครงเดียวกับไฟล์ Word (lib/docs/docx.ts) · ระยะและขนาดตัวอักษรอยู่ใน print.css (.official.memo)
 */
export function MemoSheet({ v, hasGaruda, annex }: { v: DocView; hasGaruda: boolean; annex?: Annex | null }) {
  return (
    <>
      <div className={`sheet official memo ${v.thaiNumerals ? "thai-num" : ""}`}>
        <div className="memo-head"><Garuda has={hasGaruda} mm={15} /><p className="title">{v.heading}</p></div>
        <Field label="ส่วนราชการ">{v.orgLines[0]}</Field>
        <div className="memo-row">
          <Field label="ที่">{v.docNo}</Field>
          <Field label="วันที่">{v.dateText}</Field>
        </div>
        <Field label="เรื่อง">{v.subject}</Field>
        <p className="memo-to">เรียน&nbsp;&nbsp;{v.toLine}</p>
        <Body v={v} />
        <div className="sign">
          <p>({v.signerName || "......................................................"})</p>
          <p>{v.signerTitle || "ตำแหน่ง ......................................................"}</p>
        </div>
        {v.endorsements.length > 0 && (
          <div className="endorse" style={{ gridTemplateColumns: `repeat(${v.endorsements.length === 3 ? 3 : Math.min(2, v.endorsements.length)}, 1fr)` }}>
            {v.endorsements.map((e, i) => (
              <div key={i} className="endorse-box">
                <p className="endorse-head">{e.heading}</p>
                <p className="dots">&nbsp;</p>
                <p className="dots">&nbsp;</p>
                <p className="endorse-sign">({e.name || "......................................................"})</p>
                <p className="endorse-sign">{e.title}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      {annex && <AnnexSheet a={annex} thai={v.thaiNumerals} />}
    </>
  );
}

/** สิ่งที่ส่งมาด้วย — หน้าใหม่ ต่อท้ายบันทึกข้อความ (ตารางรายละเอียดอยู่ที่นี่ ไม่อยู่ในตัวบันทึก) */
export function AnnexSheet({ a, thai }: { a: Annex; thai: boolean }) {
  return (
    <div className={`sheet official annex ${thai ? "thai-num" : ""}`}>
      <p className="annex-title">{a.title}</p>
      <p className="annex-subject">{a.subject}</p>
      {a.blocks.map((b, i) => (
        <div key={i} className="annex-block">
          {b.heading && <p className="annex-head">{b.heading}</p>}
          {b.lines?.map((l, k) => <p key={k} className="annex-line">{l}</p>)}
          {b.table && (
            <table>
              {b.table.widths && <colgroup>{b.table.widths.map((w, k) => <col key={k} style={{ width: `${w}%` }} />)}</colgroup>}
              <thead><tr>{b.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{b.table.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}

export function DocSheet({ v, hasGaruda, annex }: { v: DocView; hasGaruda: boolean; annex?: Annex | null }) {
  if (v.kind === "memo") return <MemoSheet v={v} hasGaruda={hasGaruda} annex={annex} />;
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
