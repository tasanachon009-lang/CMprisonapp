-- ประวัติการใช้งานเพิ่มได้อย่างเดียว: ห้ามแก้หรือลบ แม้เข้าฐานข้อมูลโดยตรง (สเปก 2.4)
CREATE TRIGGER `audit_logs_no_update` BEFORE UPDATE ON `audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'audit_logs เป็นแบบเพิ่มได้อย่างเดียว ห้ามแก้ไข');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_logs_no_delete` BEFORE DELETE ON `audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'audit_logs เป็นแบบเพิ่มได้อย่างเดียว ห้ามลบ');
END;
