# รายงานผลตรวจความปลอดภัยอัตโนมัติ

- วันเวลา: 10/10/2569 23:05:42
- เป้าหมาย: http://localhost:3000 (ข้อมูลปลอม)
- ผล: **ผ่าน 251/251 ข้อ**

## 1. เข้าหน้าโดยไม่ล็อกอิน

| ผล | รายการ | รายละเอียด |
|---|---|---|
| ✅ ผ่าน | / | HTTP 307 → /device |
| ✅ ผ่าน | /courses | HTTP 307 → /device |
| ✅ ผ่าน | /cohorts/12 | HTTP 307 → /device |
| ✅ ผ่าน | /cohorts/12/roster | HTTP 307 → /device |
| ✅ ผ่าน | /persons/1 | HTTP 307 → /device |
| ✅ ผ่าน | /persons?q=สม | HTTP 307 → /device |
| ✅ ผ่าน | /release | HTTP 307 → /device |
| ✅ ผ่าน | /import | HTTP 307 → /device |
| ✅ ผ่าน | /register?cohort=12 | HTTP 307 → /device |
| ✅ ผ่าน | /admin | HTTP 307 → /device |
| ✅ ผ่าน | /admin/users | HTTP 307 → /device |
| ✅ ผ่าน | /admin/audit | HTTP 307 → /device |
| ✅ ผ่าน | /admin/backup | HTTP 307 → /device |
| ✅ ผ่าน | /admin/settings | HTTP 307 → /device |
| ✅ ผ่าน | /sessions/306 | HTTP 307 → /device |
| ✅ ผ่าน | /print/sign-sheet/12 | HTTP 307 → /device |
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
| ✅ ผ่าน | rehab → /cohorts/12/roster | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | assistant → /cohorts/12/roster | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /cohorts/12/roster | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /register?cohort=12 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /register?cohort=12 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /register?cohort=12 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /register?cohort=12 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /import | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /import | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /import | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /release | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /release | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | assistant → /release | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /release | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /sessions/306 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | assistant → /sessions/306 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /sessions/306 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /print/session-sheet/306 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | assistant → /print/session-sheet/306 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /print/session-sheet/306 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /roster | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /roster | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | finance → /roster | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /roster | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /enrollments/421 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /enrollments/421 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | assistant → /enrollments/421 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | warden → /enrollments/421 | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /enrollments/421/assess/DEP?round=pre | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | admin → /enrollments/421/assess/DEP?round=pre | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /enrollments/421/assess/DEP?round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /enrollments/421/assess/DEP?round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /enrollments/421/assess/DEP?round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /enrollments/421/assess/KNOW?round=pre | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /enrollments/421/assess/KNOW?round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /enrollments/421/assess/KNOW?round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /cohorts/12/health | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /cohorts/12/health | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | finance → /cohorts/12/health | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /cohorts/12/health | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
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
| ✅ ผ่าน | rehab → /cohorts/12/assessments/quick?form=TEMP&round=pre | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /cohorts/12/assessments/quick?form=TEMP&round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /cohorts/12/assessments/quick?form=TEMP&round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /cohorts/12/assessments/quick?form=TEMP&round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | rehab → /cohorts/12/assessments/quick?form=PMHQ&round=pre | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | admin → /cohorts/12/assessments/quick?form=PMHQ&round=pre | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /cohorts/12/assessments/quick?form=PMHQ&round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /cohorts/12/assessments/quick?form=PMHQ&round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /cohorts/12/assessments/quick?form=PMHQ&round=pre | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
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
| ✅ ผ่าน | admin → /admin/doc-templates | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /admin/doc-templates | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | finance → /admin/doc-templates | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | executive → /admin/doc-templates | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
| ✅ ผ่าน | assistant → /admin/doc-templates | คาดว่าถูกปฏิเสธ · HTTP 307 → /forbidden |
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
| ✅ ผ่าน | ผู้รับผิดชอบประจำวัน: เปลี่ยนได้เฉพาะผู้มีสิทธิ์แก้ตาราง · ชิป/เหตุผลสำเร็จรูป: เฉพาะผู้ดูแลคลังหัวข้อ | ตรวจจากโค้ด server action |
| ✅ ผ่าน | ใบบันทึกผลการจัดกิจกรรม / ใบบันทึกหลังสอน ไม่มีชื่อผู้ต้องขัง | HTTP 200/200 |
| ✅ ผ่าน | ค่าตอบแทน: การเงินเห็นสรุปยอด / เจ้าหน้าที่หลักเห็นเฉพาะชั่วโมงสอน / ผู้บริหาร-ผู้ช่วยเข้าไม่ได้ | fin 200 · rehab 200 · exec 307 · asst 307 |
| ✅ ผ่าน | เจ้าหน้าที่หลัก → เปิดรอบเบิกตรงๆ ด้วย URL | HTTP 307 → /forbidden |
| ✅ ผ่าน | อนุมัติค่าตอบแทนต้องมีสิทธิ์อนุมัติ · อนุมัติยอดตัวเองไม่ได้ · ปลดล็อกเฉพาะหัวหน้า/รอง · มอบอำนาจเฉพาะหัวหน้า/รอง | ตรวจจากโค้ด server action / service |
| ✅ ผ่าน | ชุดเอกสารการเงิน PDF/Excel: การเงินเปิดได้ (ตรวจยอดผ่าน) / เจ้าหน้าที่หลักเปิดตรงๆ ไม่ได้ · ใบทดสอบการพิมพ์เฉพาะผู้ดูแล | fin 200/200 · rehab 307/403 · xls 403 · test 403 |
| ✅ ผ่าน | งบประมาณ: หัวหน้าเพิ่มการจัดสรรได้ / การเงินบันทึกจ่ายจริงได้แต่จัดสรรไม่ได้ / ผู้บริหารดูอย่างเดียว / เจ้าหน้าที่หลัก-ผู้ช่วยเข้าไม่ได้ | admin 200 · fin 200 · exec 200 · rehab 307 · asst 307 |
| ✅ ผ่าน | งบประมาณตรวจสิทธิ์ที่เซิร์ฟเวอร์ทุก action · ยืนยันเกินงบต้องมีสิทธิ์ · ฐานข้อมูลกันรวมงบเกินจัดสรร (trigger) + เงินเป็นสตางค์จำนวนเต็ม (CHECK) | trigger 3/3 · ตรวจจากโค้ด server action |
| ✅ ผ่าน | LINE: เฉพาะผู้ดูแลตั้งค่า/ส่งทดสอบ · ตัวอย่างข้อความไม่มีชื่อ/เลขประจำตัวผู้ต้องขัง · ไม่แสดง token | admin 200 · fin 307 · rehab 307 · leak false |
| ✅ ผ่าน | รายงานประจำสัปดาห์: หัวหน้าสร้าง/อนุมัติได้ · ผู้บริหารดูได้ (ไม่มีปุ่มสร้าง) · ผู้ช่วยเข้าไม่ได้ | admin 200 · exec 200 · asst 307 |
| ✅ ผ่าน | 3 วัน: รายชื่อแนะนำ (มีชื่อ) เข้าได้เฉพาะเจ้าหน้าที่ลงทะเบียน · ผู้บริหาร/การเงิน/ผู้ช่วยเข้าไม่ได้ | rehab 200 · exec 307 · fin 307 · asst 307 |
| ✅ ผ่าน | 3 วัน: ขั้นตอนโครงการ — ผู้บริหารเห็นแต่ติ๊กไม่ได้ · action ตรวจสิทธิ์ course.manage ที่เซิร์ฟเวอร์ · เกณฑ์เลขบัตร/ยืนยันโทษบังคับที่เซิร์ฟเวอร์ | exec 200 |
| ✅ ผ่าน | การเงิน → หน้ามอบอำนาจ | HTTP 307 |
| ✅ ผ่าน | ผู้ช่วย → เปิดคาบที่ไม่ได้รับผิดชอบ (ไม่เห็นฟอร์มปิดคาบ) | HTTP 307 → /forbidden |
| ✅ ผ่าน | แบบพิมพ์เปล่า: มีรหัสแบบ (รหัส-เวอร์ชัน-รอบ-เลขลงทะเบียน) | HTTP 200 |
| ✅ ผ่าน | ทะเบียนวิทยากร: เจ้าหน้าที่หลักเห็นเลขบัญชี/เลขบัตรแบบปิดบัง | HTTP 200 |
| ✅ ผ่าน | ทะเบียนวิทยากร: การเงินเห็นเลขบัญชีเต็ม | HTTP 200 |
| ✅ ผ่าน | admin → /enrollments/278/referral | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /enrollments/278/referral | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /enrollments/278/referral | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | finance → /enrollments/278/referral | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | assistant → /enrollments/278/referral | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | warden → /enrollments/278/referral | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | admin → /print/referral/278 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /print/referral/278 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /print/referral/278 | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | finance → /print/referral/278 | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | assistant → /print/referral/278 | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | warden → /print/referral/278 | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | admin → /print/referral-list/8 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /print/referral-list/8 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /print/referral-list/8 | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | finance → /print/referral-list/8 | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | assistant → /print/referral-list/8 | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | warden → /print/referral-list/8 | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | ผู้บริหาร → แท็บสถานพยาบาลรุ่น 3 วัน เห็นยอดส่งต่อ แต่ไม่มีชื่อ/โรค/ปุ่มพิมพ์ | HTTP 200 |
| ✅ ผ่าน | เปิดดูรายการส่งต่อ → บันทึกการเปิดดูข้อมูลสุขภาพ | บันทึก 8 → 9 |
| ✅ ผ่าน | แจ้งเตือนไม่มีชื่อโรคจากรายการส่งต่อ | พบ 0 ข้อความ |
| ✅ ผ่าน | admin → /cohorts/11/documents | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /cohorts/11/documents | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | finance → /cohorts/11/documents | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /cohorts/11/documents | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | assistant → /cohorts/11/documents | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | warden → /cohorts/11/documents | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | admin → /documents/1 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /documents/1 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | finance → /documents/1 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /documents/1 | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | assistant → /documents/1 | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | warden → /documents/1 | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | admin → /print/document/1 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | rehab → /print/document/1 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | finance → /print/document/1 | คาดว่าเข้าได้ · HTTP 200 |
| ✅ ผ่าน | executive → /print/document/1 | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | assistant → /print/document/1 | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | warden → /print/document/1 | คาดว่าถูกปฏิเสธ · HTTP 307 |
| ✅ ผ่าน | ไฟล์ Word เอกสาร: ไม่ล็อกอิน | HTTP 401 |
| ✅ ผ่าน | ไฟล์ Word เอกสาร: ผู้บริหาร (ไม่มีสิทธิ์) | HTTP 403 |
| ✅ ผ่าน | ไฟล์ Word เอกสาร: เจ้าหน้าที่ฟื้นฟูดาวน์โหลดได้ (เป็นไฟล์ .docx จริง) | HTTP 200 · 10508 ไบต์ |
| ✅ ผ่าน | การเงินเปิดเอกสารได้แบบดูอย่างเดียว (ไม่มีปุ่มบันทึก/ลบ) | HTTP 200 |
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

## 7. เครือข่ายขาออก

| ผล | รายการ | รายละเอียด |
|---|---|---|
| ✅ ผ่าน | เชื่อมต่อออกเฉพาะ api.line.me (โค้ดส่ง LINE ไม่มีปลายทางอื่น) · ไม่มี token = โหมดทดลอง · ข้อมูลปลอม = ไม่ส่งจริง | https://api.line.me |

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
