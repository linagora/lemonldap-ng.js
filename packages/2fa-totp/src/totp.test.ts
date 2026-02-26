/**
 * Tests for 2fa-totp TOTP implementation
 */

import {
  generateSecret,
  generateCode,
  verifyCode,
  generateOtpAuthUri,
  encryptSecret,
  decryptSecret,
  isEncrypted,
  base32Encode,
  base32Decode,
  DEFAULT_OPTIONS,
} from "./totp";

describe("TOTP Secret generation", () => {
  describe("generateSecret", () => {
    it("should generate a base32 encoded secret", () => {
      const secret = generateSecret();
      expect(secret).toBeTruthy();
      // Base32 uses only A-Z and 2-7
      expect(secret).toMatch(/^[A-Z2-7]+$/);
    });

    it("should generate unique secrets", () => {
      const secrets = new Set([
        generateSecret(),
        generateSecret(),
        generateSecret(),
      ]);
      expect(secrets.size).toBe(3);
    });

    it("should generate secrets of consistent length", () => {
      // 20 bytes = 160 bits, base32 encodes 5 bits per char = 32 chars
      const secret = generateSecret();
      expect(secret.length).toBe(32);
    });
  });
});

describe("TOTP Code generation and verification", () => {
  // Known test vector from RFC 6238
  // Secret: "12345678901234567890" (base32: GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ)
  const testSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  describe("generateCode", () => {
    it("should generate a 6-digit code by default", () => {
      const code = generateCode(testSecret);
      expect(code).toMatch(/^\d{6}$/);
    });

    it("should generate an 8-digit code when configured", () => {
      const code = generateCode(testSecret, { digits: 8 });
      expect(code).toMatch(/^\d{8}$/);
    });
  });

  describe("verifyCode", () => {
    it("should verify a valid code", () => {
      const secret = generateSecret();
      const code = generateCode(secret);
      const result = verifyCode(secret, code);

      expect(result.valid).toBe(true);
    });

    it("should reject an invalid code", () => {
      const secret = generateSecret();
      const result = verifyCode(secret, "000000");

      expect(result.valid).toBe(false);
    });

    it("should handle codes with spaces", () => {
      const secret = generateSecret();
      const code = generateCode(secret);
      const spacedCode = code.slice(0, 3) + " " + code.slice(3);
      const result = verifyCode(secret, spacedCode);

      expect(result.valid).toBe(true);
    });

    it("should reject non-numeric codes", () => {
      const secret = generateSecret();
      const result = verifyCode(secret, "abcdef");

      expect(result.valid).toBe(false);
    });

    it("should reject codes of wrong length", () => {
      const secret = generateSecret();
      const result = verifyCode(secret, "12345"); // 5 digits

      expect(result.valid).toBe(false);
    });

    it("should accept codes within range tolerance", () => {
      const secret = generateSecret();
      const code = generateCode(secret);
      // With default range=1, should accept current window
      const result = verifyCode(secret, code, { range: 1 });

      expect(result.valid).toBe(true);
    });
  });
});

describe("OTP Auth URI generation", () => {
  describe("generateOtpAuthUri", () => {
    it("should generate a valid otpauth URI", () => {
      const uri = generateOtpAuthUri(
        "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
        "testuser",
        "MyApp",
      );

      expect(uri).toStartWith("otpauth://totp/");
      expect(uri).toContain("MyApp");
      expect(uri).toContain("testuser");
      expect(uri).toContain("secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    });

    it("should encode special characters in issuer and user", () => {
      const uri = generateOtpAuthUri("SECRET", "user@example.com", "My App");

      expect(uri).toContain(encodeURIComponent("My App"));
      expect(uri).toContain(encodeURIComponent("user@example.com"));
    });

    it("should include digits parameter when non-default", () => {
      const uri = generateOtpAuthUri("SECRET", "user", "App", { digits: 8 });
      expect(uri).toContain("digits=8");
    });

    it("should include period parameter when non-default", () => {
      const uri = generateOtpAuthUri("SECRET", "user", "App", { interval: 60 });
      expect(uri).toContain("period=60");
    });

    it("should include algorithm parameter when non-default", () => {
      const uri = generateOtpAuthUri("SECRET", "user", "App", {
        algorithm: "sha256",
      });
      expect(uri).toContain("algorithm=SHA256");
    });

    it("should not include optional parameters when using defaults", () => {
      const uri = generateOtpAuthUri("SECRET", "user", "App");

      expect(uri).not.toContain("digits=");
      expect(uri).not.toContain("period=");
      expect(uri).not.toContain("algorithm=");
    });
  });
});

describe("Secret encryption/decryption", () => {
  // Mock cipher
  const mockCipher = {
    encrypt: (data: string) => Buffer.from(data).toString("base64"),
    decrypt: (data: string) => Buffer.from(data, "base64").toString(),
  };

  describe("encryptSecret", () => {
    it("should encrypt secret with llngcrypt prefix", () => {
      const secret = "MYSECRET";
      const encrypted = encryptSecret(secret, mockCipher);

      expect(encrypted).toStartWith("{llngcrypt}");
      expect(encrypted).not.toContain("MYSECRET");
    });
  });

  describe("decryptSecret", () => {
    it("should decrypt encrypted secret", () => {
      const secret = "MYSECRET";
      const encrypted = encryptSecret(secret, mockCipher);
      const decrypted = decryptSecret(encrypted, mockCipher);

      expect(decrypted).toBe(secret);
    });

    it("should return plain secret if not encrypted", () => {
      const secret = "PLAINSECRET";
      const result = decryptSecret(secret, mockCipher);

      expect(result).toBe(secret);
    });
  });

  describe("isEncrypted", () => {
    it("should return true for encrypted secrets", () => {
      expect(isEncrypted("{llngcrypt}encrypted")).toBe(true);
    });

    it("should return false for plain secrets", () => {
      expect(isEncrypted("PLAINSECRET")).toBe(false);
    });
  });
});

describe("Base32 encoding/decoding", () => {
  describe("base32Encode", () => {
    it("should encode buffer to base32", () => {
      // "Hello" in ASCII
      const buffer = Buffer.from("Hello");
      const encoded = base32Encode(buffer);

      // Known base32 encoding of "Hello"
      expect(encoded).toBe("JBSWY3DP");
    });

    it("should encode empty buffer", () => {
      const buffer = Buffer.from("");
      const encoded = base32Encode(buffer);

      expect(encoded).toBe("");
    });
  });

  describe("base32Decode", () => {
    it("should decode base32 to buffer", () => {
      const decoded = base32Decode("JBSWY3DP");
      expect(decoded.toString()).toBe("Hello");
    });

    it("should handle lowercase input", () => {
      const decoded = base32Decode("jbswy3dp");
      expect(decoded.toString()).toBe("Hello");
    });

    it("should handle padding", () => {
      const decoded = base32Decode("JBSWY3DP======");
      expect(decoded.toString()).toBe("Hello");
    });

    it("should throw on invalid characters", () => {
      expect(() => base32Decode("INVALID!")).toThrow();
    });
  });

  describe("roundtrip", () => {
    it("should encode and decode correctly", () => {
      const original = Buffer.from("Test message 123!");
      const encoded = base32Encode(original);
      const decoded = base32Decode(encoded);

      expect(decoded.toString()).toBe(original.toString());
    });

    it("should handle binary data", () => {
      const original = Buffer.from([0x00, 0xff, 0x12, 0x34, 0xab, 0xcd]);
      const encoded = base32Encode(original);
      const decoded = base32Decode(encoded);

      expect(decoded).toEqual(original);
    });
  });
});

describe("Default options", () => {
  it("should have correct default values", () => {
    expect(DEFAULT_OPTIONS.interval).toBe(30);
    expect(DEFAULT_OPTIONS.digits).toBe(6);
    expect(DEFAULT_OPTIONS.range).toBe(1);
    expect(DEFAULT_OPTIONS.algorithm).toBe("sha1");
  });
});

// Custom matcher for string prefix
expect.extend({
  toStartWith(received: string, expected: string) {
    const pass = received.startsWith(expected);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to start with ${expected}`
          : `expected ${received} to start with ${expected}`,
    };
  },
});

declare module "vitest" {
  interface Assertion<T = unknown> {
    toStartWith(expected: string): T;
  }
  interface AsymmetricMatchersContaining {
    toStartWith(expected: string): unknown;
  }
}
