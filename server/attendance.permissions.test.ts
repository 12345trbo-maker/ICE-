import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { isUsableLocalManager, normalizePhone } from "./db";
import type { TrpcContext } from "./_core/context";

function context(role: "admin" | "user" | null, accessRole?: "primary_manager" | "assistant_manager" | "supervisor" | "employee"): TrpcContext {
  return {
    user: role ? {
      id: 1,
      openId: "owner-1",
      email: "owner@example.com",
      name: "مدير الاختبار",
      loginMethod: "test",
      role,
      accessRole,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("attendance permissions", () => {
  it("rejects workspace access without authentication", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.attendance.workspace()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects manager mutations for non-admin users", async () => {
    const caller = appRouter.createCaller(context("user"));
    await expect(caller.attendance.settings({ workDays: 26 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.attendance.addEmployee({
      name: "موظف",
      job: "دور",
      username: "employee",
      phone: "01000000000",
      salary: 5000,
      leaveBalance: 4,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.attendance.decideRequest({ requestId: 1, status: "approved" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("validates production inputs before touching the database", async () => {
    const caller = appRouter.createCaller(context("admin"));
    await expect(caller.attendance.addEmployee({
      name: "x",
      job: "",
      username: "x",
      phone: "1",
      salary: -1,
      leaveBalance: 4,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires a strong enough password for a new manager account", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.auth.registerManager({ name: "مدير جديد", phone: "01000000000", password: "123" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires phone and password to sign in as a manager", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.auth.loginManager({ phone: "1", password: "" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("does not treat empty or legacy manager records as usable local accounts", () => {
    expect(isUsableLocalManager({ active: 0, phone: "", passwordHash: "oauth-managed" })).toBe(false);
    expect(isUsableLocalManager({ active: 1, phone: "", passwordHash: "bad" })).toBe(false);
    expect(isUsableLocalManager({ active: 1, phone: "01000000000", passwordHash: "a".repeat(32) + ":" + "b".repeat(128) })).toBe(true);
  });

  it("normalizes Arabic digits and common Egyptian international phone formats", () => {
    expect(normalizePhone("٠١١٠٧٢٠٤٥٤٢")).toBe("01107204542");
    expect(normalizePhone("+20 1107204542")).toBe("01107204542");
    expect(normalizePhone("00201107204542")).toBe("01107204542");
  });

  it("validates reset codes before any password-reset work", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.auth.resetPassword({ phone: "01000000000", code: "12", newPassword: "new-password" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps account promotion restricted to the primary manager", async () => {
    const caller = appRouter.createCaller(context("admin", "supervisor"));
    await expect(caller.attendance.promoteAccount({ accountId: 1, accessRole: "assistant_manager" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps supervisor and assistant permissions narrower than the primary manager", async () => {
    const supervisor = appRouter.createCaller(context("admin", "supervisor"));
    const assistant = appRouter.createCaller(context("admin", "assistant_manager"));
    await expect(supervisor.attendance.settings({ workDays: 26 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assistant.attendance.settings({ workDays: 26 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(supervisor.attendance.decideRequest({ requestId: 1, status: "approved" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows an admin to update settings and returns the workspace", async () => {
    const caller = appRouter.createCaller(context("admin"));
    const result = await caller.attendance.settings({ workDays: 26 });
    expect(result?.settings?.workDays).toBe(26);
  }, 15000);
});
