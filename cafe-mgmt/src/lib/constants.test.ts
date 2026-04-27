import { describe, it, expect } from "vitest";
import {
  MAX_FEED_CARDS,
  UNDO_TIMEOUT_MS,
  SESSION_EXPIRY_DAYS,
  BRUTE_FORCE_MAX_ATTEMPTS,
  BRUTE_FORCE_LOCKOUT_MINUTES,
} from "./constants";

describe("constants", () => {
  it("has correct MAX_FEED_CARDS", () => {
    expect(MAX_FEED_CARDS).toBe(5);
  });

  it("has correct UNDO_TIMEOUT_MS", () => {
    expect(UNDO_TIMEOUT_MS).toBe(5000);
  });

  it("has correct SESSION_EXPIRY_DAYS", () => {
    expect(SESSION_EXPIRY_DAYS).toBe(30);
  });

  it("has correct BRUTE_FORCE_MAX_ATTEMPTS", () => {
    expect(BRUTE_FORCE_MAX_ATTEMPTS).toBe(5);
  });

  it("has correct BRUTE_FORCE_LOCKOUT_MINUTES", () => {
    expect(BRUTE_FORCE_LOCKOUT_MINUTES).toBe(15);
  });
});
