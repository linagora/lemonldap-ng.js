/**
 * Tests for 2fa-common base classes
 */

import { InMemoryTokenManager } from "./base";

describe("InMemoryTokenManager", () => {
  let tokenManager: InMemoryTokenManager;

  beforeEach(() => {
    tokenManager = new InMemoryTokenManager();
  });

  describe("createToken", () => {
    it("should create a token with data", async () => {
      const data = { user: "testuser", action: "register" };
      const tokenId = await tokenManager.createToken(data);

      expect(tokenId).toBeTruthy();
      expect(tokenId.length).toBe(64); // 32 bytes hex encoded
    });

    it("should add _utime to token data", async () => {
      const before = Math.floor(Date.now() / 1000);
      const tokenId = await tokenManager.createToken({ test: true });
      const after = Math.floor(Date.now() / 1000);

      const retrieved = await tokenManager.getToken(tokenId);
      expect(retrieved).toBeTruthy();
      expect(retrieved!._utime).toBeGreaterThanOrEqual(before);
      expect(retrieved!._utime).toBeLessThanOrEqual(after);
    });

    it("should generate unique tokens", async () => {
      const tokens = await Promise.all([
        tokenManager.createToken({ id: 1 }),
        tokenManager.createToken({ id: 2 }),
        tokenManager.createToken({ id: 3 }),
      ]);

      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(3);
    });
  });

  describe("getToken", () => {
    it("should retrieve token data", async () => {
      const data = { user: "testuser", secret: "abc123" };
      const tokenId = await tokenManager.createToken(data);

      const retrieved = await tokenManager.getToken(tokenId);
      expect(retrieved).toBeTruthy();
      expect(retrieved!.user).toBe("testuser");
      expect(retrieved!.secret).toBe("abc123");
    });

    it("should delete token by default (one-time use)", async () => {
      const tokenId = await tokenManager.createToken({ test: true });

      const first = await tokenManager.getToken(tokenId);
      expect(first).toBeTruthy();

      const second = await tokenManager.getToken(tokenId);
      expect(second).toBeNull();
    });

    it("should keep token when keep=true", async () => {
      const tokenId = await tokenManager.createToken({ test: true });

      const first = await tokenManager.getToken(tokenId, true);
      expect(first).toBeTruthy();

      const second = await tokenManager.getToken(tokenId, true);
      expect(second).toBeTruthy();
    });

    it("should return null for non-existent token", async () => {
      const result = await tokenManager.getToken("non-existent-token");
      expect(result).toBeNull();
    });

    it("should return null for expired token", async () => {
      const tokenId = await tokenManager.createToken({ test: true }, 0.001); // 1ms timeout

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await tokenManager.getToken(tokenId);
      expect(result).toBeNull();
    });
  });

  describe("updateToken", () => {
    it("should update token data", async () => {
      const tokenId = await tokenManager.createToken({ counter: 0 });

      const updated = await tokenManager.updateToken(tokenId, "counter", 1);
      expect(updated).toBe(true);

      const retrieved = await tokenManager.getToken(tokenId);
      expect(retrieved!.counter).toBe(1);
    });

    it("should return false for non-existent token", async () => {
      const updated = await tokenManager.updateToken(
        "non-existent",
        "key",
        "value",
      );
      expect(updated).toBe(false);
    });

    it("should return false for expired token", async () => {
      const tokenId = await tokenManager.createToken({ test: true }, 0.001);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await tokenManager.updateToken(tokenId, "test", false);
      expect(updated).toBe(false);
    });
  });

  describe("deleteToken", () => {
    it("should delete token", async () => {
      const tokenId = await tokenManager.createToken({ test: true });

      await tokenManager.deleteToken(tokenId);

      const result = await tokenManager.getToken(tokenId);
      expect(result).toBeNull();
    });

    it("should not throw for non-existent token", async () => {
      await expect(
        tokenManager.deleteToken("non-existent"),
      ).resolves.not.toThrow();
    });
  });

  describe("Token expiration cleanup", () => {
    it("should clean expired tokens on createToken", async () => {
      // Create tokens with very short timeout
      const expiredToken = await tokenManager.createToken(
        { expired: true },
        0.001,
      );

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Create new token (triggers cleanup)
      await tokenManager.createToken({ fresh: true });

      // Expired token should be cleaned
      const result = await tokenManager.getToken(expiredToken);
      expect(result).toBeNull();
    });
  });
});
