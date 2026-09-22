import { and, eq } from "drizzle-orm";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import {
  attendanceAccounts,
  attendanceDeductions,
  attendanceEmployees,
  attendanceEmployeeDocuments,
  attendanceHolidays,
  attendanceRecords,
  attendanceRequests,
  attendanceSchedules,
  attendanceSettings,
  attendanceAuditLogs,
  attendanceLeaveTypes,
  attendanceOvertime,
  attendancePayrollPeriods,
  passwordResetOtps,
  InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { storagePut } from "./storage";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  values.lastSignedIn ??= new Date();
  updateSet.lastSignedIn ??= new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export function normalizePhone(phone: string) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const easternDigits = "۰۱۲۳۴۵۶۷۸۹";
  const translated = phone.replace(/[٠-٩۰-۹]/g, character => {
    const arabicIndex = arabicDigits.indexOf(character);
    if (arabicIndex >= 0) return String(arabicIndex);
    return String(easternDigits.indexOf(character));
  });
  let digits = translated.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("20") && digits.length === 12) digits = `0${digits.slice(2)}`;
  if (digits.startsWith("1") && digits.length === 10) digits = `0${digits}`;
  return digits;
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}
export function isUsableLocalManager(account: { active: number; phone: string; passwordHash: string }) {
  return account.active === 1 && normalizePhone(account.phone).length >= 5 && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(account.passwordHash);
}

export async function registerLocalManager(input: { name: string; phone: string; password: string }) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const phone = normalizePhone(input.phone);
  const managerRows = await db.select().from(attendanceAccounts)
    .where(and(eq(attendanceAccounts.role, "manager"), eq(attendanceAccounts.accessRole, "primary_manager")));
  const existing = managerRows.find((row) => isUsableLocalManager(row));
  const recoverable = managerRows.find((row) => !isUsableLocalManager(row) && row.passwordHash !== "oauth-managed");
  if (existing) throw new Error("MANAGER_EXISTS");
  if (recoverable) {
    await db.update(users).set({ name: input.name.trim(), loginMethod: "phone", role: "admin" }).where(eq(users.openId, recoverable.ownerOpenId));
    await db.update(attendanceAccounts).set({ name: input.name.trim(), username: phone, phone, passwordHash: hashPassword(input.password), accessRole: "primary_manager", active: 1 }).where(eq(attendanceAccounts.id, recoverable.id));
    await ensureWorkspaceSettings(recoverable.ownerOpenId);
    return { openId: recoverable.ownerOpenId, name: input.name.trim(), accessRole: "primary_manager" as const };
  }
  const openId = `local_manager_${randomUUID()}`;
  await db.insert(users).values({ openId, name: input.name.trim(), email: null, loginMethod: "phone", role: "admin" });
  await db.insert(attendanceAccounts).values({ ownerOpenId: openId, role: "manager", accessRole: "primary_manager", name: input.name.trim(), username: phone, phone, email: null, passwordHash: hashPassword(input.password), job: "مدير المساحة", active: 1 });
  await ensureWorkspaceSettings(openId);
  return { openId, name: input.name.trim() };
}


function toTwilioPhone(phone: string) {
  const normalized = normalizePhone(phone);
  if (normalized.startsWith("0") && normalized.length === 11) return `+20${normalized.slice(1)}`;
  if (normalized.startsWith("20") && normalized.length === 12) return `+${normalized}`;
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}

export async function requestManagerPasswordReset(phoneInput: string) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const phone = normalizePhone(phoneInput);
  const account = (await db.select().from(attendanceAccounts)
    .where(and(eq(attendanceAccounts.phone, phone), eq(attendanceAccounts.role, "manager"), eq(attendanceAccounts.active, 1))).limit(1))[0];
  if (!account || !isUsableLocalManager(account)) throw new Error("RESET_NOT_AVAILABLE");
  if (!ENV.twilioAccountSid || !ENV.twilioAuthToken || !ENV.twilioFrom) throw new Error("SMS_NOT_CONFIGURED");
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const body = new URLSearchParams({ To: toTwilioPhone(phone), From: ENV.twilioFrom, Body: `رمز استعادة كلمة مرور حضور: ${code}. صالح لمدة 10 دقائق.` });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${ENV.twilioAccountSid}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${ENV.twilioAccountSid}:${ENV.twilioAuthToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) {
    console.warn("[Twilio] Password reset SMS failed", response.status);
    throw new Error("SMS_SEND_FAILED");
  }
  await db.update(passwordResetOtps).set({ consumed: 1 }).where(and(eq(passwordResetOtps.accountId, account.id), eq(passwordResetOtps.consumed, 0)));
  await db.insert(passwordResetOtps).values({ accountId: account.id, phone, codeHash: hashPassword(code), expiresAt, attempts: 0, consumed: 0 });
  return { success: true as const };
}

export async function resetManagerPassword(phoneInput: string, code: string, newPassword: string) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const phone = normalizePhone(phoneInput);
  const otp = (await db.select().from(passwordResetOtps).where(and(eq(passwordResetOtps.phone, phone), eq(passwordResetOtps.consumed, 0))).limit(1))[0];
  if (!otp || otp.expiresAt.getTime() < Date.now() || otp.attempts >= 5) throw new Error("INVALID_RESET_CODE");
  if (!verifyPassword(code, otp.codeHash)) {
    await db.update(passwordResetOtps).set({ attempts: otp.attempts + 1 }).where(eq(passwordResetOtps.id, otp.id));
    throw new Error("INVALID_RESET_CODE");
  }
  await db.update(attendanceAccounts).set({ passwordHash: hashPassword(newPassword) }).where(eq(attendanceAccounts.id, otp.accountId));
  await db.update(passwordResetOtps).set({ consumed: 1 }).where(eq(passwordResetOtps.id, otp.id));
  return { success: true as const };
}

export async function promoteAttendanceAccount(ownerOpenId: string, accountId: number, accessRole: "assistant_manager" | "supervisor" | "employee") {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const account = (await db.select().from(attendanceAccounts).where(and(eq(attendanceAccounts.id, accountId), eq(attendanceAccounts.ownerOpenId, ownerOpenId))).limit(1))[0];
  if (!account || account.role !== "employee" || account.accessRole === "primary_manager") throw new Error("INVALID_PROMOTION");
  await db.update(attendanceAccounts).set({ accessRole }).where(eq(attendanceAccounts.id, accountId));
  return { success: true as const };
}

export async function changeLocalManagerPassword(ownerOpenId: string, currentPassword: string, newPassword: string) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); const account = await db.select().from(attendanceAccounts).where(and(eq(attendanceAccounts.ownerOpenId, ownerOpenId), eq(attendanceAccounts.role, "manager"), eq(attendanceAccounts.active, 1))).limit(1); if (!account[0] || !verifyPassword(currentPassword, account[0].passwordHash)) throw new Error("INVALID_CREDENTIALS"); await db.update(attendanceAccounts).set({ passwordHash: hashPassword(newPassword) }).where(eq(attendanceAccounts.id, account[0].id)); return { success: true as const }; }

export async function authenticateLocalEmployee(phoneInput: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const phone = normalizePhone(phoneInput);
  const account = await db.select().from(attendanceAccounts).where(and(eq(attendanceAccounts.phone, phone), eq(attendanceAccounts.role, "employee"), eq(attendanceAccounts.active, 1))).limit(1);
  if (!account[0] || !verifyPassword(password, account[0].passwordHash) || !account[0].employeeId) throw new Error("INVALID_CREDENTIALS");
  const userOpenId = `local_employee_${account[0].id}`;
  const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.openId, userOpenId)).limit(1);
  if (!existingUser[0]) await db.insert(users).values({ openId: userOpenId, name: account[0].name, email: account[0].email, loginMethod: "phone", role: "user" });
  return { openId: userOpenId, ownerOpenId: account[0].ownerOpenId, employeeId: account[0].employeeId, name: account[0].name, accessRole: account[0].accessRole };
}

export async function authenticateLocalManager(phoneInput: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const phone = normalizePhone(phoneInput);
  const account = await db.select().from(attendanceAccounts)
    .where(and(eq(attendanceAccounts.phone, phone), eq(attendanceAccounts.role, "manager"), eq(attendanceAccounts.active, 1))).limit(1);
  if (!account[0] || !isUsableLocalManager(account[0]) || !verifyPassword(password, account[0].passwordHash)) throw new Error("INVALID_CREDENTIALS");
  const user = await db.select().from(users).where(eq(users.openId, account[0].ownerOpenId)).limit(1);
  if (!user[0]) throw new Error("USER_NOT_FOUND");
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.openId, user[0].openId));
  return { openId: user[0].openId, name: user[0].name || account[0].name, accessRole: account[0].accessRole };
}

async function ensureWorkspaceSettings(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return;
  const owner = await db.select({ name: users.name, email: users.email }).from(users)
    .where(eq(users.openId, ownerOpenId)).limit(1);
  const manager = await db.select({ id: attendanceAccounts.id }).from(attendanceAccounts)
    .where(and(eq(attendanceAccounts.ownerOpenId, ownerOpenId), eq(attendanceAccounts.role, "manager"))).limit(1);
  if (!manager[0]) {
    await db.insert(attendanceAccounts).values({
      ownerOpenId,
      role: "manager",
      accessRole: "primary_manager",
      name: owner[0]?.name || "مدير المساحة",
      username: ownerOpenId,
      phone: "",
      email: owner[0]?.email || null,
      passwordHash: "oauth-managed",
      job: "مدير المساحة",
      active: 1,
    });
  }
  const existing = await db.select({ id: attendanceSettings.id })
    .from(attendanceSettings)
    .where(eq(attendanceSettings.ownerOpenId, ownerOpenId))
    .limit(1);
  if (!existing[0]) {
    await db.insert(attendanceSettings).values({
      ownerOpenId,
      workDays: 30,
      leaveDays: 4,
      penaltyUnit: "quarter",
      latitude: "",
      longitude: "",
      radius: 200,
    });
  }
}

export async function getAttendanceWorkspace(ownerOpenId: string) {
  await ensureWorkspaceSettings(ownerOpenId);
  await ensureDefaultLeaveTypes(ownerOpenId);
  await ensureCurrentPayrollPeriod(ownerOpenId);
  const db = await getDb();
  if (!db) return null;
  const [accounts, employees, schedules, deductions, requests, settings, leaveTypes, overtime, payrollPeriods, auditLogs, records, holidays, documents] = await Promise.all([
    db.select().from(attendanceAccounts).where(and(eq(attendanceAccounts.ownerOpenId, ownerOpenId), eq(attendanceAccounts.active, 1))),
    db.select().from(attendanceEmployees).where(eq(attendanceEmployees.ownerOpenId, ownerOpenId)),
    db.select().from(attendanceSchedules).where(eq(attendanceSchedules.ownerOpenId, ownerOpenId)),
    db.select().from(attendanceDeductions).where(eq(attendanceDeductions.ownerOpenId, ownerOpenId)),
    db.select().from(attendanceRequests).where(eq(attendanceRequests.ownerOpenId, ownerOpenId)),
    db.select().from(attendanceSettings).where(eq(attendanceSettings.ownerOpenId, ownerOpenId)).limit(1),
    db.select().from(attendanceLeaveTypes).where(and(eq(attendanceLeaveTypes.ownerOpenId, ownerOpenId), eq(attendanceLeaveTypes.active, 1))),
    db.select().from(attendanceOvertime).where(eq(attendanceOvertime.ownerOpenId, ownerOpenId)),
    db.select().from(attendancePayrollPeriods).where(eq(attendancePayrollPeriods.ownerOpenId, ownerOpenId)),
    db.select().from(attendanceAuditLogs).where(eq(attendanceAuditLogs.ownerOpenId, ownerOpenId)).orderBy(attendanceAuditLogs.createdAt),
    db.select().from(attendanceRecords).where(eq(attendanceRecords.ownerOpenId, ownerOpenId)).orderBy(attendanceRecords.date),
    db.select().from(attendanceHolidays).where(eq(attendanceHolidays.ownerOpenId, ownerOpenId)).orderBy(attendanceHolidays.date),
    db.select().from(attendanceEmployeeDocuments).where(eq(attendanceEmployeeDocuments.ownerOpenId, ownerOpenId)).orderBy(attendanceEmployeeDocuments.createdAt),
  ]);
  return { accounts, employees, schedules, deductions, requests, settings: settings[0] ?? null, leaveTypes, overtime, payrollPeriods, auditLogs, records, holidays, documents };
}

async function ensureDefaultLeaveTypes(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select({ id: attendanceLeaveTypes.id }).from(attendanceLeaveTypes).where(eq(attendanceLeaveTypes.ownerOpenId, ownerOpenId)).limit(1);
  if (existing[0]) return;
  await db.insert(attendanceLeaveTypes).values([
    { ownerOpenId, name: "إجازة سنوية", defaultDays: 21, paid: 1, active: 1 },
    { ownerOpenId, name: "إجازة مرضية", defaultDays: 0, paid: 1, active: 1 },
    { ownerOpenId, name: "إجازة طارئة", defaultDays: 0, paid: 1, active: 1 },
    { ownerOpenId, name: "بدون أجر", defaultDays: 0, paid: 0, active: 1 },
  ]);
}

async function ensureCurrentPayrollPeriod(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return;
  const period = new Date().toISOString().slice(0, 7);
  const existing = await db.select({ id: attendancePayrollPeriods.id }).from(attendancePayrollPeriods)
    .where(and(eq(attendancePayrollPeriods.ownerOpenId, ownerOpenId), eq(attendancePayrollPeriods.period, period))).limit(1);
  if (!existing[0]) await db.insert(attendancePayrollPeriods).values({ ownerOpenId, period, status: "open" });
}

async function addAuditLog(ownerOpenId: string, actor: string, action: string, entity: string, entityId: number | undefined, beforeValue: unknown, afterValue: unknown, note?: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(attendanceAuditLogs).values({ ownerOpenId, actor, action, entity, entityId: entityId ?? null, beforeValue: beforeValue === undefined ? null : JSON.stringify(beforeValue), afterValue: afterValue === undefined ? null : JSON.stringify(afterValue), note: note || null });
}

export async function updateAttendanceSettings(ownerOpenId: string, values: {
  workDays?: number;
  leaveDays?: number;
  penaltyUnit?: string;
  latitude?: string;
  longitude?: string;
  radius?: number;
}) {
  await ensureWorkspaceSettings(ownerOpenId);
  const db = await getDb();
  if (!db) return null;
  await db.update(attendanceSettings).set(values).where(eq(attendanceSettings.ownerOpenId, ownerOpenId));
  return getAttendanceWorkspace(ownerOpenId);
}

export async function createAttendanceEmployee(ownerOpenId: string, input: {
  name: string;
  job: string;
  username: string;
  phone: string;
  salary: number;
  leaveBalance: number;
  department?: string;
  branch?: string;
  hireDate?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const [created] = await db.insert(attendanceEmployees).values({
    ownerOpenId,
    name: input.name,
    initial: input.name.trim().slice(0, 1),
    job: input.job,
    username: input.username,
    phone: normalizePhone(input.phone),
    salary: input.salary,
    leaveBalance: input.leaveBalance,
    department: input.department || null,
    branch: input.branch || null,
    hireDate: input.hireDate || null,
    employmentStatus: "active",
    attendance: "غائب",
    checkIn: "—",
    lateMinutes: 0,
  }).$returningId();
  const employeeId = created.id;
  const days = [
    ["الأحد", "13"], ["الإثنين", "14"], ["الثلاثاء", "15"], ["الأربعاء", "16"], ["الخميس", "17"], ["الجمعة", "18"], ["السبت", "19"],
  ] as const;
  await db.insert(attendanceSchedules).values(days.map(([day, date]) => ({
    ownerOpenId,
    employeeId,
    day,
    date,
    status: "دوام" as const,
    start: "08:00",
    end: "16:00",
    shiftType: "صباحي" as const,
  })));
  return getAttendanceWorkspace(ownerOpenId);
}

export async function createAttendanceAccount(ownerOpenId: string, input: {
  role: "manager" | "employee";
  accessRole: "assistant_manager" | "supervisor" | "employee";
  name: string;
  employeeId?: number;
  username: string;
  phone: string;
  email?: string;
  password: string;
  job?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  if (input.employeeId) {
    const employee = await db.select({ id: attendanceEmployees.id }).from(attendanceEmployees)
      .where(and(eq(attendanceEmployees.id, input.employeeId), eq(attendanceEmployees.ownerOpenId, ownerOpenId))).limit(1);
    if (!employee[0]) return null;
  }
  await db.insert(attendanceAccounts).values({
    ownerOpenId,
    role: input.role,
    accessRole: input.accessRole,
    name: input.name,
    employeeId: input.employeeId,
    username: input.username,
    phone: normalizePhone(input.phone),
    email: input.email || null,
    passwordHash: hashPassword(input.password),
    job: input.job || null,
    active: 1,
  });
  return getAttendanceWorkspace(ownerOpenId);
}

export async function deleteAttendanceAccount(ownerOpenId: string, accountId: number) {
  const db = await getDb();
  if (!db) return null;
  await db.update(attendanceAccounts).set({ active: 0 }).where(and(eq(attendanceAccounts.id, accountId), eq(attendanceAccounts.ownerOpenId, ownerOpenId)));
  return getAttendanceWorkspace(ownerOpenId);
}

export async function updateAttendanceSchedule(ownerOpenId: string, input: {
  employeeId: number;
  day: string;
  date: string;
  status: "دوام" | "راحة";
  start: string;
  end: string;
  shiftType: "صباحي" | "مسائي" | "مرن";
}) {
  const db = await getDb();
  if (!db) return null;
  const employee = await db.select({ id: attendanceEmployees.id }).from(attendanceEmployees)
    .where(and(eq(attendanceEmployees.id, input.employeeId), eq(attendanceEmployees.ownerOpenId, ownerOpenId))).limit(1);
  if (!employee[0]) return null;
  const existing = await db.select({ id: attendanceSchedules.id }).from(attendanceSchedules)
    .where(and(eq(attendanceSchedules.employeeId, input.employeeId), eq(attendanceSchedules.ownerOpenId, ownerOpenId), eq(attendanceSchedules.date, input.date))).limit(1);
  if (existing[0]) {
    await db.update(attendanceSchedules).set(input).where(and(eq(attendanceSchedules.id, existing[0].id), eq(attendanceSchedules.ownerOpenId, ownerOpenId)));
  } else {
    await db.insert(attendanceSchedules).values({ ownerOpenId, ...input });
  }
  return getAttendanceWorkspace(ownerOpenId);
}

export async function punchAttendance(ownerOpenId: string, employeeId: number, mode: "in" | "out", time: string, lateMinutes: number) {
  const db = await getDb();
  if (!db) return null;
  const employee = await db.select({ id: attendanceEmployees.id }).from(attendanceEmployees)
    .where(and(eq(attendanceEmployees.id, employeeId), eq(attendanceEmployees.ownerOpenId, ownerOpenId))).limit(1);
  if (!employee[0]) return null;
  await db.update(attendanceEmployees).set(mode === "in" ? { attendance: lateMinutes >= 15 ? "متأخر" : "حاضر", checkIn: time, lateMinutes } : { checkOut: time })
    .where(and(eq(attendanceEmployees.id, employeeId), eq(attendanceEmployees.ownerOpenId, ownerOpenId)));
  return getAttendanceWorkspace(ownerOpenId);
}

export async function createAttendanceRequest(ownerOpenId: string, input: {
  employeeId: number;
  kind: string;
  title: string;
  date: string;
  leaveTypeId?: number;
  days: number;
  hours?: number;
  note: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const employee = await db.select({ id: attendanceEmployees.id }).from(attendanceEmployees)
    .where(and(eq(attendanceEmployees.id, input.employeeId), eq(attendanceEmployees.ownerOpenId, ownerOpenId))).limit(1);
  if (!employee[0]) return null;
  await db.insert(attendanceRequests).values({ ownerOpenId, ...input, leaveTypeId: input.leaveTypeId || null, hours: input.hours || 0, status: "pending" });
  return getAttendanceWorkspace(ownerOpenId);
}

export async function decideAttendanceRequest(ownerOpenId: string, requestId: number, status: "approved" | "rejected", decisionBy: string) {
  const db = await getDb();
  if (!db) return null;
  const request = await db.select().from(attendanceRequests)
    .where(and(eq(attendanceRequests.id, requestId), eq(attendanceRequests.ownerOpenId, ownerOpenId))).limit(1);
  if (!request[0]) return null;
  if (request[0].status !== "pending") return getAttendanceWorkspace(ownerOpenId);
  let employeeLeaveBalance: number | null = null;
  if (status === "approved" && request[0].kind === "إجازة" && request[0].days > 0) {
    const employee = await db.select({ leaveBalance: attendanceEmployees.leaveBalance }).from(attendanceEmployees)
      .where(and(eq(attendanceEmployees.id, request[0].employeeId), eq(attendanceEmployees.ownerOpenId, ownerOpenId))).limit(1);
    employeeLeaveBalance = employee[0]?.leaveBalance ?? 0;
    if (employeeLeaveBalance < request[0].days) throw new Error("INSUFFICIENT_LEAVE_BALANCE");
  }
  await db.update(attendanceRequests).set({ status, decisionBy, decidedAt: new Date() }).where(and(eq(attendanceRequests.id, requestId), eq(attendanceRequests.ownerOpenId, ownerOpenId)));
  if (status === "approved" && request[0].kind === "إجازة" && request[0].days > 0) {
    await db.update(attendanceEmployees).set({ leaveBalance: Math.max(0, (employeeLeaveBalance ?? 0) - request[0].days) })
      .where(and(eq(attendanceEmployees.id, request[0].employeeId), eq(attendanceEmployees.ownerOpenId, ownerOpenId)));
  }
  if (status === "rejected" && request[0].kind === "عذر انصراف") {
    await db.insert(attendanceDeductions).values({
      ownerOpenId,
      employeeId: request[0].employeeId,
      type: "quarter",
      reason: `خصم بسبب رفض عذر الانصراف: ${request[0].note}`,
      createdBy: decisionBy,
    });
  }
  await addAuditLog(ownerOpenId, decisionBy, "request_decision", "request", requestId, { status: request[0].status }, { status }, request[0].note);
  return getAttendanceWorkspace(ownerOpenId);
}

export async function createAttendanceDeduction(ownerOpenId: string, input: {
  employeeId: number;
  type: string;
  reason: string;
  amount?: number;
  createdBy: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const employee = await db.select({ id: attendanceEmployees.id }).from(attendanceEmployees)
    .where(and(eq(attendanceEmployees.id, input.employeeId), eq(attendanceEmployees.ownerOpenId, ownerOpenId))).limit(1);
  if (!employee[0]) return null;
  await db.insert(attendanceDeductions).values({ ownerOpenId, ...input });
  return getAttendanceWorkspace(ownerOpenId);
}

export async function cancelAttendanceDeduction(ownerOpenId: string, deductionId: number, cancelledBy: string) {
  const db = await getDb();
  if (!db) return null;
  await db.update(attendanceDeductions).set({ cancelled: 1, cancelledBy, cancelledAt: new Date() })
    .where(and(eq(attendanceDeductions.id, deductionId), eq(attendanceDeductions.ownerOpenId, ownerOpenId)));
  return getAttendanceWorkspace(ownerOpenId);
}

export async function correctAttendance(ownerOpenId: string, input: { employeeId: number; attendance: "حاضر" | "متأخر" | "غائب"; checkIn: string; checkOut?: string; lateMinutes: number; note: string; actor: string }) {
  const db = await getDb();
  if (!db) return null;
  const employee = (await db.select().from(attendanceEmployees).where(and(eq(attendanceEmployees.id, input.employeeId), eq(attendanceEmployees.ownerOpenId, ownerOpenId))).limit(1))[0];
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
  await db.update(attendanceEmployees).set({ attendance: input.attendance, checkIn: input.checkIn, checkOut: input.checkOut || null, lateMinutes: input.lateMinutes }).where(and(eq(attendanceEmployees.id, input.employeeId), eq(attendanceEmployees.ownerOpenId, ownerOpenId)));
  await db.insert(attendanceRecords).values({ ownerOpenId, employeeId: input.employeeId, date: new Date().toISOString().slice(0, 10), attendance: input.attendance, checkIn: input.checkIn || "—", checkOut: input.checkOut || null, lateMinutes: input.lateMinutes, note: input.note, updatedBy: input.actor });
  await addAuditLog(ownerOpenId, input.actor, "attendance_corrected", "employee", input.employeeId, { attendance: employee.attendance, checkIn: employee.checkIn, checkOut: employee.checkOut, lateMinutes: employee.lateMinutes }, { attendance: input.attendance, checkIn: input.checkIn, checkOut: input.checkOut || null, lateMinutes: input.lateMinutes }, input.note);
  return getAttendanceWorkspace(ownerOpenId);
}

export async function updateAttendanceEmployee(ownerOpenId: string, input: { employeeId: number; name: string; job: string; phone: string; salary: number; leaveBalance: number; department?: string; branch?: string; hireDate?: string; employmentStatus: string; actor: string }) {
  const db = await getDb();
  if (!db) return null;
  const employee = await db.select().from(attendanceEmployees).where(and(eq(attendanceEmployees.id, input.employeeId), eq(attendanceEmployees.ownerOpenId, ownerOpenId))).limit(1);
  if (!employee[0]) throw new Error("EMPLOYEE_NOT_FOUND");
  await db.update(attendanceEmployees).set({ name: input.name, job: input.job, phone: input.phone, salary: input.salary, leaveBalance: input.leaveBalance, department: input.department || null, branch: input.branch || null, hireDate: input.hireDate || null, employmentStatus: input.employmentStatus }).where(and(eq(attendanceEmployees.id, input.employeeId), eq(attendanceEmployees.ownerOpenId, ownerOpenId)));
  await addAuditLog(ownerOpenId, input.actor, "employee_profile_updated", "employee", input.employeeId, employee[0], input, "تحديث ملف الموظف وبيانات HR");
  return getAttendanceWorkspace(ownerOpenId);
}

export async function createAttendanceHoliday(ownerOpenId: string, input: { date: string; name: string; paid: boolean; actor: string }) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(attendanceHolidays).values({ ownerOpenId, date: input.date, name: input.name, paid: input.paid ? 1 : 0, createdBy: input.actor });
  await addAuditLog(ownerOpenId, input.actor, "holiday_created", "holiday", undefined, undefined, input, "إضافة عطلة رسمية");
  return getAttendanceWorkspace(ownerOpenId);
}

export async function deleteAttendanceHoliday(ownerOpenId: string, holidayId: number, actor: string) {
  const db = await getDb();
  if (!db) return null;
  const holiday = await db.select().from(attendanceHolidays).where(and(eq(attendanceHolidays.id, holidayId), eq(attendanceHolidays.ownerOpenId, ownerOpenId))).limit(1);
  if (!holiday[0]) throw new Error("HOLIDAY_NOT_FOUND");
  await db.delete(attendanceHolidays).where(and(eq(attendanceHolidays.id, holidayId), eq(attendanceHolidays.ownerOpenId, ownerOpenId)));
  await addAuditLog(ownerOpenId, actor, "holiday_deleted", "holiday", holidayId, holiday[0], undefined, "حذف عطلة رسمية");
  return getAttendanceWorkspace(ownerOpenId);
}

export async function uploadAttendanceEmployeeDocument(ownerOpenId: string, input: { employeeId: number; fileName: string; mimeType: string; fileSize: number; dataBase64: string; actor: string }) {
  const db = await getDb();
  if (!db) return null;
  if (input.fileSize <= 0 || input.fileSize > 8 * 1024 * 1024) throw new Error("DOCUMENT_TOO_LARGE");
  const employee = await db.select({ id: attendanceEmployees.id }).from(attendanceEmployees).where(and(eq(attendanceEmployees.id, input.employeeId), eq(attendanceEmployees.ownerOpenId, ownerOpenId))).limit(1);
  if (!employee[0]) throw new Error("EMPLOYEE_NOT_FOUND");
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "document";
  const uploaded = await storagePut(`attendance/${ownerOpenId}/employees/${input.employeeId}/${safeName}`, Buffer.from(input.dataBase64, "base64"), input.mimeType || "application/octet-stream");
  await db.insert(attendanceEmployeeDocuments).values({ ownerOpenId, employeeId: input.employeeId, fileName: input.fileName, fileKey: uploaded.key, fileUrl: uploaded.url, mimeType: input.mimeType, fileSize: input.fileSize, uploadedBy: input.actor });
  await addAuditLog(ownerOpenId, input.actor, "employee_document_uploaded", "employee_document", undefined, undefined, { employeeId: input.employeeId, fileName: input.fileName }, "رفع مستند إلى ملف الموظف");
  return getAttendanceWorkspace(ownerOpenId);
}

export async function deleteAttendanceEmployeeDocument(ownerOpenId: string, documentId: number, actor: string) {
  const db = await getDb();
  if (!db) return null;
  const document = await db.select().from(attendanceEmployeeDocuments).where(and(eq(attendanceEmployeeDocuments.id, documentId), eq(attendanceEmployeeDocuments.ownerOpenId, ownerOpenId))).limit(1);
  if (!document[0]) throw new Error("DOCUMENT_NOT_FOUND");
  await db.delete(attendanceEmployeeDocuments).where(and(eq(attendanceEmployeeDocuments.id, documentId), eq(attendanceEmployeeDocuments.ownerOpenId, ownerOpenId)));
  await addAuditLog(ownerOpenId, actor, "employee_document_deleted", "employee_document", documentId, document[0], undefined, "حذف مرجع مستند الموظف");
  return getAttendanceWorkspace(ownerOpenId);
}

export async function createAttendanceOvertime(ownerOpenId: string, input: { employeeId: number; date: string; hours: number; rate: number; note: string; createdBy: string }) {
  const db = await getDb();
  if (!db) return null;
  const employee = await db.select({ id: attendanceEmployees.id }).from(attendanceEmployees).where(and(eq(attendanceEmployees.id, input.employeeId), eq(attendanceEmployees.ownerOpenId, ownerOpenId))).limit(1);
  if (!employee[0]) throw new Error("EMPLOYEE_NOT_FOUND");
  await db.insert(attendanceOvertime).values({ ownerOpenId, ...input, status: "pending" });
  await addAuditLog(ownerOpenId, input.createdBy, "overtime_created", "overtime", undefined, undefined, { employeeId: input.employeeId, date: input.date, hours: input.hours, rate: input.rate }, input.note);
  return getAttendanceWorkspace(ownerOpenId);
}

export async function decideAttendanceOvertime(ownerOpenId: string, overtimeId: number, status: "approved" | "rejected", decidedBy: string) {
  const db = await getDb();
  if (!db) return null;
  const overtime = (await db.select().from(attendanceOvertime).where(and(eq(attendanceOvertime.id, overtimeId), eq(attendanceOvertime.ownerOpenId, ownerOpenId))).limit(1))[0];
  if (!overtime) throw new Error("OVERTIME_NOT_FOUND");
  if (overtime.status !== "pending") return getAttendanceWorkspace(ownerOpenId);
  await db.update(attendanceOvertime).set({ status, decidedBy, decidedAt: new Date() }).where(and(eq(attendanceOvertime.id, overtimeId), eq(attendanceOvertime.ownerOpenId, ownerOpenId)));
  await addAuditLog(ownerOpenId, decidedBy, "overtime_decision", "overtime", overtimeId, { status: overtime.status }, { status }, overtime.note);
  return getAttendanceWorkspace(ownerOpenId);
}

export async function updatePayrollPeriod(ownerOpenId: string, periodId: number, status: "open" | "review" | "approved" | "closed", actor: string) {
  const db = await getDb();
  if (!db) return null;
  const period = (await db.select().from(attendancePayrollPeriods).where(and(eq(attendancePayrollPeriods.id, periodId), eq(attendancePayrollPeriods.ownerOpenId, ownerOpenId))).limit(1))[0];
  if (!period) throw new Error("PAYROLL_PERIOD_NOT_FOUND");
  if (status === "closed") {
    const pendingRequests = await db.select({ id: attendanceRequests.id }).from(attendanceRequests).where(and(eq(attendanceRequests.ownerOpenId, ownerOpenId), eq(attendanceRequests.status, "pending"))).limit(1);
    const pendingOvertime = await db.select({ id: attendanceOvertime.id }).from(attendanceOvertime).where(and(eq(attendanceOvertime.ownerOpenId, ownerOpenId), eq(attendanceOvertime.status, "pending"))).limit(1);
    if (pendingRequests[0] || pendingOvertime[0]) throw new Error("PENDING_ITEMS");
  }
  await db.update(attendancePayrollPeriods).set({ status, approvedBy: status === "approved" || status === "closed" ? actor : period.approvedBy, approvedAt: status === "approved" || status === "closed" ? new Date() : period.approvedAt }).where(and(eq(attendancePayrollPeriods.id, periodId), eq(attendancePayrollPeriods.ownerOpenId, ownerOpenId)));
  await addAuditLog(ownerOpenId, actor, "payroll_period_status", "payroll_period", periodId, { status: period.status }, { status });
  return getAttendanceWorkspace(ownerOpenId);
}
