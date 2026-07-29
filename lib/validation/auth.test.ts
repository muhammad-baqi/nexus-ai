import { describe, expect, it } from "vitest";

import { registerSchema } from "./auth";

describe("registerSchema", () => {
  it("rejects a password under 8 characters", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "ab1",
      confirmPassword: "ab1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password with no digit", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "abcdefgh",
      confirmPassword: "abcdefgh",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password with no letter", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "12345678",
      confirmPassword: "12345678",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched password and confirmation", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "abcd1234",
      confirmPassword: "abcd5678",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid email and password pair", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(result.success).toBe(true);
  });
});
