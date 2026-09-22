import { describe, expect, it } from "vitest";
import { calculatePayroll, distanceMeters, penaltyQuarters } from "./Home";

describe("AttendGlass payroll rules", () => {
  it("does not deduct before 15 minutes and adds a quarter per 15 minutes", () => {
    expect(penaltyQuarters(14)).toBe(0);
    expect(penaltyQuarters(15)).toBe(1);
    expect(penaltyQuarters(30)).toBe(2);
    expect(penaltyQuarters(31)).toBe(2);
    expect(penaltyQuarters(45)).toBe(3);
  });

  it("calculates the automatic quarter-day deduction from selected work days", () => {
    const result = calculatePayroll({ salary: 9000, lateMinutes: 15, deductions: [] } as never, 30);
    expect(result.dayValue).toBe(300);
    expect(result.autoQuarters).toBe(1);
    expect(result.automaticDeduction).toBe(75);
    expect(result.net).toBe(8925);
  });

  it("adds manual half-day deductions and ignores cancelled records", () => {
    const result = calculatePayroll({
      salary: 9000,
      lateMinutes: 0,
      deductions: [
        { type: "half", reason: "تأخير متكرر", createdBy: "مدير المساحة", createdAt: "اليوم" },
        { type: "day", reason: "سجل ملغى", createdBy: "مدير المساحة", createdAt: "اليوم", cancelled: true },
      ],
    } as never, 30);
    expect(result.manualQuarterCount).toBe(2);
    expect(result.manualQuarterDeduction).toBe(150);
    expect(result.totalDeduction).toBe(150);
    expect(result.net).toBe(8850);
  });

  it("calculates GPS distance in meters for geofence validation", () => {
    expect(distanceMeters(30.0444, 31.2357, 30.0444, 31.2357)).toBe(0);
    expect(distanceMeters(30.0444, 31.2357, 30.0453, 31.2357)).toBeGreaterThan(90);
    expect(distanceMeters(30.0444, 31.2357, 30.0453, 31.2357)).toBeLessThan(110);
  });
});
