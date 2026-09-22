import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createManagerContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "manager-test",
    email: "manager@example.com",
    name: "مدير الاختبار",
    loginMethod: "local",
    role: "user",
    accessRole: "primary_manager",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("attendance HR features", () => {
  it("validates the employee profile status before touching the database", async () => {
    const caller = appRouter.createCaller(createManagerContext());
    await expect(caller.attendance.updateEmployee({
      employeeId: 7,
      name: "موظف تجريبي",
      job: "محاسب",
      username: "test.employee",
      phone: "01000000000",
      salary: 10000,
      leaveBalance: 4,
      employmentStatus: "invalid" as never,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires the employee username as part of a complete HR profile", async () => {
    const caller = appRouter.createCaller(createManagerContext());
    await expect(caller.attendance.updateEmployee({
      employeeId: 7,
      name: "موظف تجريبي",
      job: "محاسب",
      phone: "01000000000",
      salary: 10000,
      leaveBalance: 4,
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});


describe("attendance governance validation", () => {
  it("validates the holiday date format before creating a holiday", async () => {
    const caller = appRouter.createCaller(createManagerContext());
    await expect(caller.attendance.addHoliday({
      date: "2026/09/23",
      name: "عطلة اختبار",
      paid: true,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects invalid payroll transition values at the router boundary", async () => {
    const caller = appRouter.createCaller(createManagerContext());
    await expect(caller.attendance.updatePayrollPeriod({
      periodId: 1,
      status: "draft" as never,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});


describe("employee document validation", () => {
  it("rejects an oversized employee document at the router boundary", async () => {
    const caller = appRouter.createCaller(createManagerContext());
    await expect(caller.attendance.uploadEmployeeDocument({
      employeeId: 7,
      fileName: "contract.pdf",
      mimeType: "application/pdf",
      fileSize: 9 * 1024 * 1024,
      dataBase64: "c21hbGw=",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
