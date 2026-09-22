ALTER TABLE attendance_employees
  ADD COLUMN department varchar(120) NULL,
  ADD COLUMN branch varchar(120) NULL,
  ADD COLUMN hireDate varchar(16) NULL,
  ADD COLUMN employmentStatus varchar(32) NOT NULL DEFAULT 'active';

ALTER TABLE attendance_requests
  ADD COLUMN hours int NOT NULL DEFAULT 0,
  ADD COLUMN decidedAt timestamp NULL;

CREATE TABLE IF NOT EXISTS attendance_leave_types (
  id int AUTO_INCREMENT PRIMARY KEY,
  ownerOpenId varchar(64) NOT NULL,
  name varchar(80) NOT NULL,
  defaultDays int NOT NULL DEFAULT 0,
  paid int NOT NULL DEFAULT 1,
  active int NOT NULL DEFAULT 1,
  createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_overtime (
  id int AUTO_INCREMENT PRIMARY KEY,
  ownerOpenId varchar(64) NOT NULL,
  employeeId int NOT NULL,
  date varchar(16) NOT NULL,
  hours int NOT NULL,
  rate int NOT NULL DEFAULT 1,
  note text NOT NULL,
  status enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  createdBy varchar(160) NOT NULL,
  decidedBy varchar(160) NULL,
  decidedAt timestamp NULL,
  createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_payroll_periods (
  id int AUTO_INCREMENT PRIMARY KEY,
  ownerOpenId varchar(64) NOT NULL,
  period varchar(7) NOT NULL,
  status enum('open','review','approved','closed') NOT NULL DEFAULT 'open',
  approvedBy varchar(160) NULL,
  approvedAt timestamp NULL,
  createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_audit_logs (
  id int AUTO_INCREMENT PRIMARY KEY,
  ownerOpenId varchar(64) NOT NULL,
  actor varchar(160) NOT NULL,
  action varchar(64) NOT NULL,
  entity varchar(64) NOT NULL,
  entityId int NULL,
  beforeValue text NULL,
  afterValue text NULL,
  note text NULL,
  createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
