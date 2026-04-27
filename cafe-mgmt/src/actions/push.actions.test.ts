import { describe, it, expect } from "vitest";
import { z } from "zod/v4";

// Test the subscription schema validation directly
const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

describe("push subscription schema", () => {
  it("accepts valid subscription data", () => {
    const result = subscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-T",
      auth: "tBHItJI5svbpC7-0AQ",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing endpoint", () => {
    const result = subscribeSchema.safeParse({
      p256dh: "key",
      auth: "auth",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid endpoint URL", () => {
    const result = subscribeSchema.safeParse({
      endpoint: "not-a-url",
      p256dh: "key",
      auth: "auth",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty p256dh", () => {
    const result = subscribeSchema.safeParse({
      endpoint: "https://example.com/push",
      p256dh: "",
      auth: "auth",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty auth", () => {
    const result = subscribeSchema.safeParse({
      endpoint: "https://example.com/push",
      p256dh: "key",
      auth: "",
    });
    expect(result.success).toBe(false);
  });
});
