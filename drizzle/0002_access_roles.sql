ALTER TABLE `attendance_accounts`
  ADD COLUMN `accessRole` varchar(32) NOT NULL DEFAULT 'employee';

UPDATE `attendance_accounts`
SET `accessRole` = CASE WHEN `role` = 'manager' THEN 'primary_manager' ELSE 'employee' END;
