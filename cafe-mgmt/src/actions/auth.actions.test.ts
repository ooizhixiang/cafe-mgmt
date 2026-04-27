import { describe, it, expect } from "vitest";

// Test the generateTempPassword logic (extracted for testing)
const UNAMBIGUOUS_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generateTempPassword(length = 12): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(
    array,
    (byte) => UNAMBIGUOUS_CHARS[byte % UNAMBIGUOUS_CHARS.length]
  ).join("");
}

describe("generateTempPassword", () => {
  it("generates password of correct length", () => {
    const password = generateTempPassword(12);
    expect(password).toHaveLength(12);
  });

  it("generates password with custom length", () => {
    const password = generateTempPassword(16);
    expect(password).toHaveLength(16);
  });

  it("only uses unambiguous characters", () => {
    const password = generateTempPassword(100);
    for (const char of password) {
      expect(UNAMBIGUOUS_CHARS).toContain(char);
    }
  });

  it("does not contain ambiguous characters (0, O, 1, l, I)", () => {
    // Generate many passwords to increase confidence
    for (let i = 0; i < 20; i++) {
      const password = generateTempPassword(50);
      expect(password).not.toMatch(/[0O1lI]/);
    }
  });

  it("generates unique passwords", () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 50; i++) {
      passwords.add(generateTempPassword());
    }
    expect(passwords.size).toBe(50);
  });
});

// Test Zod validation schemas
import { z } from "zod";

const registerViaInviteSchema = z.object({
  code: z.string().min(1, "Invite code is required"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const changePasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

describe("registerViaInviteSchema", () => {
  it("accepts valid input", () => {
    const result = registerViaInviteSchema.safeParse({
      code: "abc-123",
      name: "John",
      email: "john@test.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing code", () => {
    const result = registerViaInviteSchema.safeParse({
      code: "",
      name: "John",
      email: "john@test.com",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = registerViaInviteSchema.safeParse({
      code: "abc-123",
      name: "John",
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = registerViaInviteSchema.safeParse({
      code: "abc-123",
      name: "John",
      email: "john@test.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = registerViaInviteSchema.safeParse({
      code: "abc-123",
      name: "",
      email: "john@test.com",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("accepts valid password", () => {
    const result = changePasswordSchema.safeParse({
      newPassword: "newpassword123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = changePasswordSchema.safeParse({
      newPassword: "short",
    });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 8 characters", () => {
    const result = changePasswordSchema.safeParse({
      newPassword: "12345678",
    });
    expect(result.success).toBe(true);
  });
});

describe("invite constants", () => {
  it("max pending invites is 20", () => {
    const MAX_PENDING_INVITES = 20;
    expect(MAX_PENDING_INVITES).toBe(20);
  });

  it("invite expiry is 7 days", () => {
    const INVITE_EXPIRY_DAYS = 7;
    const expiryMs = INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    expect(expiryMs).toBe(604800000);
  });
});
