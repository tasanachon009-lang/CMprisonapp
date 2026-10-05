# รายงานผลตรวจความปลอดภัยอัตโนมัติ

- วันเวลา: 5/10/2569 14:00:46
- เป้าหมาย: http://localhost:3000 (ข้อมูลปลอม)
- ผล: **ผ่าน 189/189 ข้อ**

## 1. เข้าหน้าโดยไม่ล็อกอิน

| ผล | รายการ | รายละเอียด |
|---|---|---|
| ✅ ผ่าน | / | HTTP 307 → /device |
| ✅ ผ่าน | /courses | HTTP 307 → /device |
| ✅ ผ่าน | /cohorts/11 | HTTP 307 → /device |
| ✅ ผ่าน | /cohorts/11/roster | HTTP 307 → /device |
| ✅ ผ่าน | /persons/1 | HTTP 307 → /device |
| ✅ ผ่าน | /persons?q=สม | HTTP 307 → /device |
| ✅ ผ่าน | /release | HTTP 307 → /device |
| ✅ ผ่าน | /import | HTTP 307 → /device |
| ✅ ผ่าน | /register?cohort=11 | HTTP 307 → /device |
| ✅ ผ่าน | /admin | HTTP 307 → /device |
| ✅ ผ่าน | /admin/users | HTTP 307 → /device |
| ✅ ผ่าน | /admin/audit | HTTP 307 → /device |
| ✅ ผ่าน | /admin/backup | HTTP 307 → /device |
| ✅ ผ่าน | /admin/settings | HTTP 307 → /device |
| ✅ ผ่าน | /sessions/241 | HTTP 307 → /device |
| ✅ ผ่าน | /print/sign-sheet/11 | HTTP 307 → /device |
| ✅ ผ่าน | /roster | HTTP 307 → /device |
| ✅ ผ่าน | /notifications | HTTP 307 → /device |
| ✅ ผ่าน | /api/files/photo/1 | HTTP 401 |
| ✅ ผ่าน | /api/import/template | HTTP 401 |
| ✅ ผ่าน | มีรหัสหน่วยงานแต่ยังไม่เลือกผู้ใช้ | → /login |
| ✅ ผ่าน | cookie เซสชันปลอม | → /login |
| ✅ ผ่าน | หน้าจอถูกล็อกแล้วเปิด URL ตรง | → /lock |

## 2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ

| ผล | รายการ | รายละเอียด |
|---|---|---|
| ✅ ผ่าน | admin → /admin/users | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /admin/users | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /admin/users | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /admin/users | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | executive → /admin/users | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /admin/users | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | admin → /admin/audit | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /admin/audit | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | executive → /admin/audit | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | admin → /admin/backup | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /admin/backup | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /admin/backup | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | admin → /admin/settings | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /admin/settings | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | admin → /persons/1 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /persons/1 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /persons/1 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | assistant → /persons/1 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /persons/1 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /persons/1 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /cohorts/11/roster | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | assistant → /cohorts/11/roster | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /cohorts/11/roster | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /register?cohort=11 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /register?cohort=11 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /register?cohort=11 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /register?cohort=11 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /import | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /import | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /import | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /release | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /release | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | assistant → /release | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /release | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /sessions/241 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | assistant → /sessions/241 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /sessions/241 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /print/session-sheet/241 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | assistant → /print/session-sheet/241 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /print/session-sheet/241 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /roster | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /roster | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | finance → /roster | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /roster | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /enrollments/411 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /enrollments/411 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | assistant → /enrollments/411 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /enrollments/411 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /enrollments/411/assess/DEP?round=pre | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | admin → /enrollments/411/assess/DEP?round=pre | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /enrollments/411/assess/DEP?round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /enrollments/411/assess/DEP?round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /enrollments/411/assess/DEP?round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /enrollments/411/assess/KNOW?round=pre | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /enrollments/411/assess/KNOW?round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /enrollments/411/assess/KNOW?round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /cohorts/11/health | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /cohorts/11/health | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | finance → /cohorts/11/health | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /cohorts/11/health | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /bst | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /bst | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /bst | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /bst | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /bst | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /inbox | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | assistant → /inbox | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | finance → /inbox | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | executive → /inbox | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /inbox | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /assigned | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /assigned | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /cohorts/11/assessments/quick?form=TEMP&round=pre | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /cohorts/11/assessments/quick?form=TEMP&round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /cohorts/11/assessments/quick?form=TEMP&round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /cohorts/11/assessments/quick?form=TEMP&round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /cohorts/11/assessments/quick?form=PMHQ&round=pre | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | admin → /cohorts/11/assessments/quick?form=PMHQ&round=pre | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /cohorts/11/assessments/quick?form=PMHQ&round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /cohorts/11/assessments/quick?form=PMHQ&round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /cohorts/11/assessments/quick?form=PMHQ&round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /rt101 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /rt101 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /rt101 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /rt101 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /rt101 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /print/bst?s=rt101 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /print/bst?s=rt101 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /print/bst?s=rt101 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | admin → /admin/forms | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /admin/forms | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | executive → /admin/forms | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /instructors | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | finance → /instructors | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /instructors | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /instructors | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /instructors | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /instructors/new | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | finance → /instructors/new | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /instructors/new | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /calendar | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | finance → /calendar | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /calendar | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | assistant → /calendar | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | warden → /calendar | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /calendar?view=month | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | warden → /calendar?view=month | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /print/calendar | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | finance → /print/calendar | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | warden → /print/calendar | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | admin → /admin/rates | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | finance → /admin/rates | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /admin/rates | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | executive → /admin/rates | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | admin → /admin/topics | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /admin/topics | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /admin/topics | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /print/instructor-form | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | finance → /print/instructor-form | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /print/instructor-form | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | admin → /admin/consent | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /admin/consent | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | executive → /admin/consent | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /admin/consent | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /incomplete | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | assistant → /incomplete | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /incomplete | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /print/person/1 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /print/person/1 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /print/person/1 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /print/emergency | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /print/emergency | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /print/emergency | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | ผู้คุม (ดูอย่างเดียว) เปิดรูปได้แต่ไม่เห็นหน้าบุคคล | รูป HTTP 404 |
| ✅ ผ่าน | การเงิน → ดาวน์โหลดแม่แบบนำเข้า | HTTP 403 |
| ✅ ผ่าน | ผู้ดูแล (OTP ปิด — ค่าเริ่มต้น) → เข้าได้ไม่ต้องใช้ OTP | HTTP 200 |
| ✅ ผ่าน | OTP ปิด → หน้าตั้งค่า OTP พากลับหน้าแรก | → / |
| ✅ ผ่าน | เปิด OTP ในตั้งค่า → ผู้ดูแลที่ยังไม่ยืนยันถูกพาไปหน้า OTP | → /otp/setup |
| ✅ ผ่าน | ตารางกิจกรรม: เจ้าหน้าที่หลักแก้คาบ/เพิ่มคาบ/เปลี่ยนวิทยากรได้ / ผู้บริหารดูอย่างเดียว | rehab HTTP 200 · exec HTTP 200 |
| ✅ ผ่าน | บันทึกและปิดคาบ: ตรวจสิทธิ์รายคาบที่เซิร์ฟเวอร์ · สร้างคาบชดเชย/เปลี่ยนสถานะเชิญ ต้องมีสิทธิ์แก้ตาราง | ตรวจจากโค้ด server action |
| ✅ ผ่าน | ผู้ช่วย → เปิดคาบที่ไม่ได้รับผิดชอบ (ไม่เห็นฟอร์มปิดคาบ) | HTTP 307 → /forbidden |
| ✅ ผ่าน | แบบพิมพ์เปล่า: มีรหัสแบบ (รหัส-เวอร์ชัน-รอบ-เลขลงทะเบียน) | HTTP 200 |
| ✅ ผ่าน | ทะเบียนวิทยากร: เจ้าหน้าที่หลักเห็นเลขบัญชี/เลขบัตรแบบปิดบัง | HTTP 200 |
| ✅ ผ่าน | ทะเบียนวิทยากร: การเงินเห็นเลขบัญชีเต็ม | HTTP 200 |
| ✅ ผ่าน | ผู้บริหาร → แท็บสถานพยาบาล ไม่มีรายชื่อผู้มีผลเสี่ยง | HTTP 200 |
| ✅ ผ่าน | ผู้บริหาร → ส่งออก Excel ที่มีชื่อ | HTTP 403 |

## 2b. มอบหมายรายรุ่น (กลุ่ม B)

| ผล | รายการ | รายละเอียด |
|---|---|---|
| ✅ ผ่าน | เปิดหน้างานที่ได้รับมอบหมาย | HTTP 200 |
| ✅ ผ่าน | หน้าบุคคลในรุ่นที่มอบหมาย → เข้าได้แบบจำกัด (ไม่มีเลขบัตร/ฐานความผิด) | HTTP 200 |
| ✅ ผ่าน | หน้าบุคคลนอกรุ่นที่มอบหมาย → ถูกปฏิเสธ | HTTP 307 → /forbidden |
| ✅ ผ่าน | แฟ้มการอบรมในรุ่นที่มอบหมาย → เข้าได้ ไม่เห็นแบบประเมิน | HTTP 200 |
| ✅ ผ่าน | แฟ้มการอบรมนอกรุ่น → ถูกปฏิเสธ | HTTP 307 |
| ✅ ผ่าน | ผู้ช่วยที่ไม่ได้รับมอบหมาย → หน้าบุคคลถูกปฏิเสธ | HTTP 307 |
| ✅ ผ่าน | กลุ่ม B → จดหมายเวร: ไม่เห็นข้อความทั่วไปของเวร แต่เห็นข้อความถึงรุ่นที่ตนสอน | HTTP 200 |
| ✅ ผ่าน | เจ้าหน้าที่หลัก → เห็นทั้งข้อความทั่วไปและข้อความถึงรุ่น | HTTP 200 |

## 3. CSRF

| ผล | รายการ | รายละเอียด |
|---|---|---|
| ✅ ผ่าน | POST อัปโหลดรูปโดยไม่มี Origin | HTTP 403 |
| ✅ ผ่าน | POST จากเว็บอื่น (Origin ต่างโดเมน) | HTTP 403 |
| ✅ ผ่าน | cookie ตั้ง SameSite=Strict + HttpOnly | ตรวจจากโค้ด (Server Action ของ Next ตรวจ Origin ให้อีกชั้น) |

## 4. SQL injection

| ผล | รายการ | รายละเอียด |
|---|---|---|
| ✅ ผ่าน | ' OR 1=1 -- | HTTP 200 |
| ✅ ผ่าน | %' UNION SELECT password_hash FROM users -- | HTTP 200 |
| ✅ ผ่าน | "; DROP TABLE persons; -- | HTTP 200 |
| ✅ ผ่าน | ตาราง persons ยังอยู่ |  |

## 5. XSS

| ผล | รายการ | รายละเอียด |
|---|---|---|
| ✅ ผ่าน | ชื่อที่เป็นโค้ด HTML ถูก escape | HTTP 200 |
| ✅ ผ่าน | Content-Security-Policy | default-src 'self'; script-src 'self' 'unsafe-inline' 'unsaf |
| ✅ ผ่าน | X-Frame-Options / nosniff |  |
| ✅ ผ่าน | ห้ามแคชหน้าข้อมูลบุคคล | no-cache, must-revalidate (dev server — ตรวจซ้ำบน production) |

## 6. ประวัติการใช้งาน

| ผล | รายการ | รายละเอียด |
|---|---|---|
| ✅ ผ่าน | ลบ audit log ตรงจากฐานข้อมูล | ถูกปฏิเสธโดย trigger |
