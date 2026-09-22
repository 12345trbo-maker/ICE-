import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const attendanceAccounts = mysqlTable("attendance_accounts", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  employeeId: int("employeeId"),
  role: mysqlEnum("role", ["manager", "employee"]).notNull(),
  accessRole: varchar("accessRole", { length: 32 }).default("employee").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  username: varchar("username", { length: 80 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  job: varchar("job", { length: 160 }),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const attendanceEmployees = mysqlTable("attendance_employees", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  initial: varchar("initial", { length: 8 }).notNull(),
  job: varchar("job", { length: 160 }).notNull(),
  username: varchar("username", { length: 80 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  salary: int("salary").default(0).notNull(),
  leaveBalance: int("leaveBalance").default(4).notNull(),
  attendance: mysqlEnum("attendance", ["حاضر", "متأخر", "غائب"]).default("غائب").notNull(),
  checkIn: varchar("checkIn", { length: 5 }).default("—").notNull(),
  checkOut: varchar("checkOut", { length: 5 }),
  lateMinutes: int("lateMinutes").default(0).notNull(),
  department: varchar("department", { length: 120 }),
  branch: varchar("branch", { length: 120 }),
  hireDate: varchar("hireDate", { length: 16 }),
  employmentStatus: varchar("employmentStatus", { length: 32 }).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const attendanceEmployeeDocuments = mysqlTable("attendance_employee_documents", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  employeeId: int("employeeId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 768 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  fileSize: int("fileSize").default(0).notNull(),
  uploadedBy: varchar("uploadedBy", { length: 160 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const attendanceRecords = mysqlTable("attendance_records", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  employeeId: int("employeeId").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  attendance: mysqlEnum("attendance", ["حاضر", "متأخر", "غائب"]).default("غائب").notNull(),
  checkIn: varchar("checkIn", { length: 5 }).default("—").notNull(),
  checkOut: varchar("checkOut", { length: 5 }),
  lateMinutes: int("lateMinutes").default(0).notNull(),
  note: text("note"),
  updatedBy: varchar("updatedBy", { length: 160 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const attendanceSchedules = mysqlTable("attendance_schedules", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  employeeId: int("employeeId").notNull(),
  day: varchar("day", { length: 32 }).notNull(),
  date: varchar("date", { length: 16 }).notNull(),
  status: mysqlEnum("status", ["دوام", "راحة"]).notNull(),
  start: varchar("start", { length: 5 }).notNull(),
  end: varchar("end", { length: 5 }).notNull(),
  shiftType: mysqlEnum("shiftType", ["صباحي", "مسائي", "مرن"]).notNull(),
});

export const attendanceDeductions = mysqlTable("attendance_deductions", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  employeeId: int("employeeId").notNull(),
  type: varchar("type", { length: 16 }).notNull(),
  reason: text("reason").notNull(),
  amount: int("amount"),
  createdBy: varchar("createdBy", { length: 160 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  cancelled: int("cancelled").default(0).notNull(),
  cancelledBy: varchar("cancelledBy", { length: 160 }),
  cancelledAt: timestamp("cancelledAt"),
});

export const attendanceRequests = mysqlTable("attendance_requests", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  employeeId: int("employeeId").notNull(),
  kind: varchar("kind", { length: 32 }).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  date: varchar("date", { length: 64 }).notNull(),
  leaveTypeId: int("leaveTypeId"),
  days: int("days").default(0).notNull(),
  hours: int("hours").default(0).notNull(),
  note: text("note").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  decisionBy: varchar("decisionBy", { length: 160 }),
  decidedAt: timestamp("decidedAt"),
});

export const attendanceLeaveTypes = mysqlTable("attendance_leave_types", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  defaultDays: int("defaultDays").default(0).notNull(),
  paid: int("paid").default(1).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const attendanceOvertime = mysqlTable("attendance_overtime", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  employeeId: int("employeeId").notNull(),
  date: varchar("date", { length: 16 }).notNull(),
  hours: int("hours").notNull(),
  rate: int("rate").default(1).notNull(),
  note: text("note").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  createdBy: varchar("createdBy", { length: 160 }).notNull(),
  decidedBy: varchar("decidedBy", { length: 160 }),
  decidedAt: timestamp("decidedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const attendancePayrollPeriods = mysqlTable("attendance_payroll_periods", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  period: varchar("period", { length: 7 }).notNull(),
  status: mysqlEnum("status", ["open", "review", "approved", "closed"]).default("open").notNull(),
  approvedBy: varchar("approvedBy", { length: 160 }),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const attendanceHolidays = mysqlTable("attendance_holidays", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  paid: int("paid").default(1).notNull(),
  createdBy: varchar("createdBy", { length: 160 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const attendanceAuditLogs = mysqlTable("attendance_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  actor: varchar("actor", { length: 160 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  entity: varchar("entity", { length: 64 }).notNull(),
  entityId: int("entityId"),
  beforeValue: text("beforeValue"),
  afterValue: text("afterValue"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const passwordResetOtps = mysqlTable("password_reset_otps", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  codeHash: varchar("codeHash", { length: 255 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  attempts: int("attempts").default(0).notNull(),
  consumed: int("consumed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const attendanceSettings = mysqlTable("attendance_settings", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull().unique(),
  workDays: int("workDays").default(30).notNull(),
  leaveDays: int("leaveDays").default(4).notNull(),
  penaltyUnit: varchar("penaltyUnit", { length: 16 }).default("quarter").notNull(),
  latitude: varchar("latitude", { length: 32 }).notNull(),
  longitude: varchar("longitude", { length: 32 }).notNull(),
  radius: int("radius").default(200).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AttendanceAccount = typeof attendanceAccounts.$inferSelect;
export type AttendanceEmployee = typeof attendanceEmployees.$inferSelect;
export type AttendanceEmployeeDocument = typeof attendanceEmployeeDocuments.$inferSelect;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type AttendanceSchedule = typeof attendanceSchedules.$inferSelect;
export type AttendanceDeduction = typeof attendanceDeductions.$inferSelect;
export type AttendanceRequest = typeof attendanceRequests.$inferSelect;
export type AttendanceSettings = typeof attendanceSettings.$inferSelect;
export type PasswordResetOtp = typeof passwordResetOtps.$inferSelect;
export type AttendanceLeaveType = typeof attendanceLeaveTypes.$inferSelect;
export type AttendanceOvertime = typeof attendanceOvertime.$inferSelect;
export type AttendancePayrollPeriod = typeof attendancePayrollPeriods.$inferSelect;
export type AttendanceAuditLog = typeof attendanceAuditLogs.$inferSelect;
export type AttendanceHoliday = typeof attendanceHolidays.$inferSelect;
export type AccessRole = "primary_manager" | "assistant_manager" | "supervisor" | "employee";
export type AttendanceImportPayload = Record<string, unknown>;
