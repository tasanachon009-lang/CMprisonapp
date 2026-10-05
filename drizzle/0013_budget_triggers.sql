-- สเปก 13.2: รวมงบทุกรุ่นของการจัดสรรเดียวกันห้ามเกินยอดที่ได้รับจัดสรร (กันที่ระดับฐานข้อมูล นอกเหนือจากหน้าจอ)
CREATE TRIGGER `budget_lines_cap_ins` AFTER INSERT ON `budget_lines`
WHEN (SELECT COALESCE(SUM(`amount_satang`), 0) FROM `budget_lines` WHERE `allocation_id` = NEW.`allocation_id` AND `deleted_at` IS NULL)
   > (SELECT `amount_satang` FROM `budget_allocations` WHERE `id` = NEW.`allocation_id`)
BEGIN SELECT RAISE(ABORT, 'BUDGET_OVER_ALLOCATION'); END;
--> statement-breakpoint
CREATE TRIGGER `budget_lines_cap_upd` AFTER UPDATE ON `budget_lines`
WHEN (SELECT COALESCE(SUM(`amount_satang`), 0) FROM `budget_lines` WHERE `allocation_id` = NEW.`allocation_id` AND `deleted_at` IS NULL)
   > (SELECT `amount_satang` FROM `budget_allocations` WHERE `id` = NEW.`allocation_id`)
BEGIN SELECT RAISE(ABORT, 'BUDGET_OVER_ALLOCATION'); END;
--> statement-breakpoint
-- ลดยอดจัดสรรให้ต่ำกว่าที่แบ่งให้รุ่นไปแล้วไม่ได้
CREATE TRIGGER `budget_allocations_cap_upd` AFTER UPDATE OF `amount_satang`, `deleted_at` ON `budget_allocations`
WHEN (SELECT COALESCE(SUM(`amount_satang`), 0) FROM `budget_lines` WHERE `allocation_id` = NEW.`id` AND `deleted_at` IS NULL)
   > (CASE WHEN NEW.`deleted_at` IS NULL THEN NEW.`amount_satang` ELSE 0 END)
BEGIN SELECT RAISE(ABORT, 'BUDGET_ALLOCATION_BELOW_DISTRIBUTED'); END;