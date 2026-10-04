import {
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  checkPasswordHash,
  hashPassword,
  makeJWT,
  validateJWT,
} from "./auth.js";

describe("Password hashing", () => {
  const password1 = "correctPassword123!";
  const password2 = "anotherPassword456!";

  let hash1: string;
  let hash2: string;

  beforeAll(async () => {
    hash1 = await hashPassword(password1);
    hash2 = await hashPassword(password2);
  });

  it("accepts the correct password", async () => {
    const result = await checkPasswordHash(
      password1,
      hash1,
    );

    expect(result).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const result = await checkPasswordHash(
      password1,
      hash2,
    );

    expect(result).toBe(false);
  });
});

describe("JWT authentication", () => {
  const userID = "123e4567-e89b-12d3-a456-426614174000";
  const secret = "test-secret";

  it("creates and validates a JWT", () => {
    const token = makeJWT(userID, 60, secret);
    const result = validateJWT(token, secret);

    expect(result).toBe(userID);
  });

  it("rejects an expired JWT", () => {
    const token = makeJWT(userID, -1, secret);

    expect(() => {
      validateJWT(token, secret);
    }).toThrow();
  });

  it("rejects a JWT signed with another secret", () => {
    const token = makeJWT(userID, 60, secret);

    expect(() => {
      validateJWT(token, "wrong-secret");
    }).toThrow();
  });
});