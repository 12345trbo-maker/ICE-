import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, approvalProcedure, deductionProcedure, primaryManagerProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  cancelAttendanceDeduction,
  createAttendanceAccount,
  createAttendanceDeduction,
  createAttendanceEmployee,
  createAttendanceRequest,
  decideAttendanceRequest,
  deleteAttendanceAccount,
  getAttendanceWorkspace,
  punchAttendance,
  updateAttendanceSchedule,
  updateAttendanceSettings,
  authenticateLocalManager,
  authenticateLocalEmployee,
  registerLocalManager,
  changeLocalManagerPassword,
  requestManagerPasswordReset,
  resetManagerPassword,
  promoteAttendanceAccount,
  correctAttendance,
  createAttendanceOvertime,
  decideAttendanceOvertime,
  updatePayrollPeriod,
  updateAttendanceEmployee,
  createAttendanceHoliday,
  deleteAttendanceHoliday,
  uploadAttendanceEmployeeDocument,
  deleteAttendanceEmployeeDocument,
} from "./db";
import { sdk } from "./_core/sdk";
import { ONE_YEAR_MS } from "@shared/const";

const settingsInput = z.object({
  workDays: z.number().int().min(1).max(31).optional(),
  leaveDays: z.number().int().min(0).max(60).optional(),
  penaltyUnit: z.enum(["none", "quarter", "half", "day"]).optional(),
  latitude: z.string().max(32).optional(),
  longitude: z.string().max(32).optional(),
  radius: z.number().int().min(20).max(5000).optional(),
});

const employeeInput = z.object({
  name: z.string().trim().min(2).max(160),
  job: z.string().trim().min(2).max(160),
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(5).max(32),
  salary: z.number().int().nonnegative().max(100000000),
  leaveBalance: z.number().int().min(0).max(60),
  department: z.string().trim().max(120).optional(),
  branch: z.string().trim().max(120).optional(),
  hireDate: z.string().max(16).optional(),
});

const scheduleInput = z.object({
  employeeId: z.number().int().positive(),
  day: z.string().min(2).max(32),
  date: z.string().min(1).max(16),
  status: z.enum(["دوام", "راحة"]),
  start: z.string().max(5),
  end: z.string().max(5),
  shiftType: z.enum(["صباحي", "مسائي", "مرن"]),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    registerManager: publicProcedure.input(z.object({ name: z.string().trim().min(2).max(160), phone: z.string().trim().min(5).max(32), password: z.string().min(6).max(128) })).mutation(async ({ ctx, input }) => {
      try {
        const manager = await registerLocalManager(input);
        const token = await sdk.createSessionToken(manager.openId, { name: manager.name, accessRole: manager.accessRole as "primary_manager" | "assistant_manager" | "supervisor" | "employee", expiresInMs: ONE_YEAR_MS });
        ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
        return { success: true } as const;
      } catch (error) {
        if (error instanceof Error && (error.message === "MANAGER_EXISTS" || error.message === "PHONE_IN_USE")) throw new TRPCError({ code: "CONFLICT", message: "يوجد مدير واحد مسجل بالفعل" });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر إنشاء حساب المدير" });
      }
    }),
    loginManager: publicProcedure.input(z.object({ phone: z.string().trim().min(5).max(32), password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      try {
        const manager = await authenticateLocalManager(input.phone, input.password);
        const token = await sdk.createSessionToken(manager.openId, { name: manager.name, accessRole: manager.accessRole as "primary_manager" | "assistant_manager" | "supervisor" | "employee", expiresInMs: ONE_YEAR_MS });
        ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
        return { success: true } as const;
      } catch {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "رقم الهاتف أو كلمة المرور غير صحيحة" });
      }
    }),
    requestPasswordReset: publicProcedure.input(z.object({ phone: z.string().trim().min(5).max(32) })).mutation(async ({ input }) => { try { return await requestManagerPasswordReset(input.phone); } catch (error) { if (error instanceof Error && error.message === "SMS_NOT_CONFIGURED") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لم يتم إعداد خدمة الرسائل النصية بعد" }); throw new TRPCError({ code: "BAD_REQUEST", message: "لا يوجد حساب مدير صالح بهذا الرقم أو تعذر إرسال الكود" }); } }),
    resetPassword: publicProcedure.input(z.object({ phone: z.string().trim().min(5).max(32), code: z.string().regex(/^\d{6}$/), newPassword: z.string().min(6).max(128) })).mutation(async ({ input }) => { try { return await resetManagerPassword(input.phone, input.code, input.newPassword); } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "كود التحقق غير صحيح أو منتهي" }); } }),
    changePassword: primaryManagerProcedure.input(z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(6).max(128) })).mutation(async ({ ctx, input }) => { try { return await changeLocalManagerPassword(ctx.user.openId, input.currentPassword, input.newPassword); } catch { throw new TRPCError({ code: "UNAUTHORIZED", message: "كلمة المرور الحالية غير صحيحة" }); } }),
    loginEmployee: publicProcedure.input(z.object({ phone: z.string().trim().min(5).max(32), password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => { try { const employee = await authenticateLocalEmployee(input.phone, input.password); const token = await sdk.createSessionToken(employee.openId, { name: employee.name, accessRole: employee.accessRole as "primary_manager" | "assistant_manager" | "supervisor" | "employee", expiresInMs: ONE_YEAR_MS, workspaceOwnerOpenId: employee.ownerOpenId, employeeId: employee.employeeId }); ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS }); return { success: true } as const; } catch { throw new TRPCError({ code: "UNAUTHORIZED", message: "رقم الهاتف أو كلمة المرور غير صحيحة" }); } }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  attendance: router({
    workspace: protectedProcedure.query(({ ctx }) => getAttendanceWorkspace(ctx.user.openId)),
    settings: primaryManagerProcedure.input(settingsInput).mutation(({ ctx, input }) => updateAttendanceSettings(ctx.user.openId, input)),
    addEmployee: primaryManagerProcedure.input(employeeInput).mutation(({ ctx, input }) => createAttendanceEmployee(ctx.user.openId, input)),
    updateEmployee: primaryManagerProcedure.input(employeeInput.extend({ employeeId: z.number().int().positive(), employmentStatus: z.enum(["active", "on_leave", "terminated"]).default("active") })).mutation(({ ctx, input }) => updateAttendanceEmployee(ctx.user.openId, { ...input, actor: ctx.user.name ?? ctx.user.openId })),
    addHoliday: primaryManagerProcedure.input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().trim().min(2).max(160), paid: z.boolean() })).mutation(({ ctx, input }) => createAttendanceHoliday(ctx.user.openId, { ...input, actor: ctx.user.name ?? ctx.user.openId })),
    deleteHoliday: primaryManagerProcedure.input(z.object({ holidayId: z.number().int().positive() })).mutation(({ ctx, input }) => deleteAttendanceHoliday(ctx.user.openId, input.holidayId, ctx.user.name ?? ctx.user.openId)),
    uploadEmployeeDocument: primaryManagerProcedure.input(z.object({ employeeId: z.number().int().positive(), fileName: z.string().min(1).max(255), mimeType: z.string().max(120), fileSize: z.number().int().positive().max(8 * 1024 * 1024), dataBase64: z.string().min(1) })).mutation(({ ctx, input }) => uploadAttendanceEmployeeDocument(ctx.user.openId, { ...input, actor: ctx.user.name ?? ctx.user.openId })),
    deleteEmployeeDocument: primaryManagerProcedure.input(z.object({ documentId: z.number().int().positive() })).mutation(({ ctx, input }) => deleteAttendanceEmployeeDocument(ctx.user.openId, input.documentId, ctx.user.name ?? ctx.user.openId)),
    addAccount: primaryManagerProcedure.input(z.object({
      role: z.enum(["manager", "employee"]),
      accessRole: z.enum(["assistant_manager", "supervisor", "employee"]),
      name: z.string().trim().min(2).max(160),
      employeeId: z.number().int().positive().optional(),
      username: z.string().trim().min(2).max(80),
      phone: z.string().trim().min(5).max(32),
      email: z.string().email().optional().or(z.literal("")),
      password: z.string().min(6).max(128),
      job: z.string().max(160).optional(),
    })).mutation(({ ctx, input }) => createAttendanceAccount(ctx.user.openId, input)),
    promoteAccount: primaryManagerProcedure.input(z.object({ accountId: z.number().int().positive(), accessRole: z.enum(["assistant_manager", "supervisor", "employee"]) })).mutation(({ ctx, input }) => promoteAttendanceAccount(ctx.user.openId, input.accountId, input.accessRole)),
    deleteAccount: primaryManagerProcedure.input(z.object({ accountId: z.number().int().positive() })).mutation(({ ctx, input }) => deleteAttendanceAccount(ctx.user.openId, input.accountId)),
    schedule: primaryManagerProcedure.input(scheduleInput).mutation(({ ctx, input }) => updateAttendanceSchedule(ctx.user.openId, input)),
    punch: protectedProcedure.input(z.object({ employeeId: z.number().int().positive(), mode: z.enum(["in", "out"]), time: z.string().max(5), lateMinutes: z.number().int().min(0).max(1440) })).mutation(({ ctx, input }) => punchAttendance(ctx.user.openId, input.employeeId, input.mode, input.time, input.lateMinutes)),
    createRequest: protectedProcedure.input(z.object({ employeeId: z.number().int().positive(), kind: z.string().min(2).max(32), title: z.string().min(2).max(160), date: z.string().min(1).max(64), leaveTypeId: z.number().int().positive().optional(), days: z.number().int().min(0).max(60), hours: z.number().int().min(0).max(24).optional(), note: z.string().min(1).max(2000) })).mutation(({ ctx, input }) => createAttendanceRequest(ctx.user.openId, input)),
    decideRequest: approvalProcedure.input(z.object({ requestId: z.number().int().positive(), status: z.enum(["approved", "rejected"]) })).mutation(({ ctx, input }) => decideAttendanceRequest(ctx.user.openId, input.requestId, input.status, ctx.user.name ?? ctx.user.openId)),
    correctAttendance: approvalProcedure.input(z.object({ employeeId: z.number().int().positive(), attendance: z.enum(["حاضر", "متأخر", "غائب"]), checkIn: z.string().max(5), checkOut: z.string().max(5).optional(), lateMinutes: z.number().int().min(0).max(1440), note: z.string().trim().min(3).max(1000) })).mutation(({ ctx, input }) => correctAttendance(ctx.user.openId, { ...input, actor: ctx.user.name ?? ctx.user.openId })),
    addOvertime: protectedProcedure.input(z.object({ employeeId: z.number().int().positive(), date: z.string().min(1).max(16), hours: z.number().int().min(1).max(24), rate: z.number().int().min(1).max(10), note: z.string().trim().min(3).max(1000) })).mutation(({ ctx, input }) => createAttendanceOvertime(ctx.user.openId, { ...input, createdBy: ctx.user.name ?? ctx.user.openId })),
    decideOvertime: approvalProcedure.input(z.object({ overtimeId: z.number().int().positive(), status: z.enum(["approved", "rejected"]) })).mutation(({ ctx, input }) => decideAttendanceOvertime(ctx.user.openId, input.overtimeId, input.status, ctx.user.name ?? ctx.user.openId)),
    updatePayrollPeriod: primaryManagerProcedure.input(z.object({ periodId: z.number().int().positive(), status: z.enum(["open", "review", "approved", "closed"]) })).mutation(({ ctx, input }) => updatePayrollPeriod(ctx.user.openId, input.periodId, input.status, ctx.user.name ?? ctx.user.openId)),
    addDeduction: deductionProcedure.input(z.object({ employeeId: z.number().int().positive(), type: z.enum(["quarter", "half", "day", "three", "four", "amount"]), reason: z.string().trim().min(1).max(1000), amount: z.number().int().nonnegative().optional() })).mutation(({ ctx, input }) => createAttendanceDeduction(ctx.user.openId, { ...input, createdBy: ctx.user.name ?? ctx.user.openId })),
    cancelDeduction: deductionProcedure.input(z.object({ deductionId: z.number().int().positive() })).mutation(({ ctx, input }) => cancelAttendanceDeduction(ctx.user.openId, input.deductionId, ctx.user.name ?? ctx.user.openId)),
  }),
});

export type AppRouter = typeof appRouter;
