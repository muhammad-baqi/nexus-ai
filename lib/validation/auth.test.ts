import { describe, expect, it } from "vitest";

import {
  authConfirmQuerySchema,
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  registerSchema,
  resetPasswordSchema,
} from "./auth";

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

describe("authConfirmQuerySchema", () => {
  it("accepts type=email and type=recovery", () => {
    expect(
      authConfirmQuerySchema.safeParse({ token_hash: "abc", type: "email" }).success,
    ).toBe(true);
    expect(
      authConfirmQuerySchema.safeParse({ token_hash: "abc", type: "recovery" }).success,
    ).toBe(true);
  });

  it("rejects an unsupported type", () => {
    expect(
      authConfirmQuerySchema.safeParse({ token_hash: "abc", type: "signup" }).success,
    ).toBe(false);
  });

  it("rejects a missing token_hash", () => {
    expect(authConfirmQuerySchema.safeParse({ type: "email" }).success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("rejects an invalid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("accepts a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "user@example.com" }).success).toBe(true);
  });
});

describe("resetPasswordSchema", () => {
  it("rejects a weak password", () => {
    const result = resetPasswordSchema.safeParse({ password: "short", confirmPassword: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched confirmation", () => {
    const result = resetPasswordSchema.safeParse({
      password: "abcd1234",
      confirmPassword: "abcd5678",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a matching, strong password pair", () => {
    const result = resetPasswordSchema.safeParse({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(result.success).toBe(true);
  });
});

describe("changePasswordSchema", () => {
  it("rejects an empty current password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "",
      newPassword: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched new password and confirmation", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "oldpass1",
      newPassword: "abcd1234",
      confirmPassword: "abcd5678",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid change-password payload", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "oldpass1",
      newPassword: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(result.success).toBe(true);
  });
});

describe("deleteAccountSchema", () => {
  it("rejects an empty password", () => {
    expect(deleteAccountSchema.safeParse({ password: "" }).success).toBe(false);
  });

  it("accepts a non-empty password", () => {
    expect(deleteAccountSchema.safeParse({ password: "whatever" }).success).toBe(true);
  });
});
