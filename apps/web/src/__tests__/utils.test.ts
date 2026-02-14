import { describe, it, expect } from "vitest";
import { cn, formatDate, formatRelativeTime } from "../lib/utils";

describe("cn utility", () => {
  it("merges class names", () => {
    expect(cn("text-red-500", "bg-blue-500")).toBe("text-red-500 bg-blue-500");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "active")).toBe("base active");
  });

  it("deduplicates tailwind classes", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles undefined and null", () => {
    expect(cn("base", undefined, null, "end")).toBe("base end");
  });
});

describe("formatDate", () => {
  it("formats a date in pt-BR format", () => {
    const date = new Date("2025-03-15T14:30:00");
    const result = formatDate(date);
    expect(result).toContain("15");
    expect(result).toContain("03");
    expect(result).toContain("14");
    expect(result).toContain("30");
  });

  it("accepts string dates", () => {
    const result = formatDate("2025-06-01T09:00:00");
    expect(result).toBeTruthy();
  });
});

describe("formatRelativeTime", () => {
  it("returns 'agora' for very recent times", () => {
    const now = new Date();
    expect(formatRelativeTime(now)).toBe("agora");
  });

  it("returns minutes for times less than an hour ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinAgo)).toBe("5min atrás");
  });

  it("returns hours for times less than a day ago", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(formatRelativeTime(twoHoursAgo)).toBe("2h atrás");
  });

  it("returns days for times less than 30 days ago", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(fiveDaysAgo)).toBe("5d atrás");
  });

  it("returns formatted date for times older than 30 days", () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const result = formatRelativeTime(oldDate);
    expect(result).not.toContain("atrás");
  });
});
