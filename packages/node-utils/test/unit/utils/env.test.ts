import { describe, expect, it, vi } from "vitest";
import { RuntimeError } from "@/errors/runtime-error";
import { defineEnv } from "@/utils/env";

const env = defineEnv<{ BILLING_URL: string }>();

describe("Env.get", () => {
  it("returns the value when it is set", () => {
    vi.stubEnv("BILLING_URL", "https://billing.example.com");

    expect(env.get("BILLING_URL")).toBe("https://billing.example.com");
  });

  it("throws a RuntimeError naming the key when it is unset", () => {
    vi.stubEnv("BILLING_URL", undefined);

    expect(() => env.get("BILLING_URL")).toThrow(RuntimeError);
    expect(() => env.get("BILLING_URL")).toThrow(/BILLING_URL/);
  });

  it("treats an empty value as unset", () => {
    vi.stubEnv("BILLING_URL", "");

    expect(() => env.get("BILLING_URL")).toThrow(/BILLING_URL/);
  });
});

describe("Env.optional", () => {
  it("returns the value when it is set", () => {
    vi.stubEnv("BILLING_URL", "https://billing.example.com");

    expect(env.optional("BILLING_URL")).toBe("https://billing.example.com");
  });

  it("returns undefined for an unset key", () => {
    vi.stubEnv("BILLING_URL", undefined);

    expect(env.optional("BILLING_URL")).toBeUndefined();
  });

  it("returns undefined for an empty key", () => {
    vi.stubEnv("BILLING_URL", "");

    expect(env.optional("BILLING_URL")).toBeUndefined();
  });
});
