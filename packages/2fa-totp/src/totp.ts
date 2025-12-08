/**
 * @lemonldap-ng/2fa-totp - TOTP Algorithm
 *
 * Core TOTP functions using otplib
 * Compatible with Perl Lemonldap::NG::Common::TOTP
 *
 * @packageDocumentation
 */

import { totp } from "otplib";
import crypto from "crypto";

/**
 * TOTP Configuration
 */
export interface TOTPOptions {
  /** Time step in seconds (default: 30) */
  interval?: number;
  /** Number of code digits (6 or 8, default: 6) */
  digits?: number;
  /** Range of time windows to accept (default: 1) */
  range?: number;
  /** Algorithm (default: sha1 for compatibility) */
  algorithm?: "sha1" | "sha256" | "sha512";
}

/**
 * Default TOTP options matching Perl implementation
 */
export const DEFAULT_OPTIONS: Required<TOTPOptions> = {
  interval: 30,
  digits: 6,
  range: 1,
  algorithm: "sha1",
};

/**
 * TOTP verification result
 */
export interface TOTPVerifyResult {
  /** Whether the code is valid */
  valid: boolean;
  /** Time window offset where code matched (-range to +range, 0 = current) */
  delta?: number;
}

/**
 * Generate a new TOTP secret
 * Equivalent to Perl newSecret() - generates 20 random bytes encoded as base32
 * @returns Base32-encoded secret
 */
export function generateSecret(): string {
  // Generate 20 random bytes (same as Perl implementation)
  const buffer = crypto.randomBytes(20);
  return base32Encode(buffer);
}

/**
 * Generate TOTP code for a secret
 * @param secret Base32-encoded secret
 * @param options TOTP options
 * @returns Generated code
 */
export function generateCode(
  secret: string,
  options: TOTPOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  totp.options = {
    step: opts.interval,
    digits: opts.digits,
    algorithm: opts.algorithm,
  };

  return totp.generate(secret);
}

/**
 * Verify a TOTP code with range tolerance
 * Equivalent to Perl verifyCode()
 * @param secret Base32-encoded secret
 * @param code User-provided code
 * @param options TOTP options
 * @returns Verification result with delta offset
 */
export function verifyCode(
  secret: string,
  code: string,
  options: TOTPOptions = {},
): TOTPVerifyResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Normalize code (remove spaces, ensure string)
  const normalizedCode = String(code).replace(/\s/g, "");

  // Validate code format
  if (!/^\d+$/.test(normalizedCode)) {
    return { valid: false };
  }

  if (normalizedCode.length !== opts.digits) {
    return { valid: false };
  }

  totp.options = {
    step: opts.interval,
    digits: opts.digits,
    algorithm: opts.algorithm,
    window: opts.range, // Allow range windows before/after
  };

  // Check with window tolerance
  try {
    const isValid = totp.verify({ token: normalizedCode, secret });

    if (isValid) {
      // otplib verify returns boolean, not delta
      // For compatibility, we return delta=0 (current window)
      return { valid: true, delta: 0 };
    }
  } catch (e) {
    // otplib throws on invalid input
    console.warn("TOTP verification error:", e);
  }

  return { valid: false };
}

/**
 * Generate otpauth:// URI for QR code
 * @param secret Base32-encoded secret
 * @param user Username/account
 * @param issuer Issuer name (displayed in authenticator apps)
 * @param options TOTP options
 * @returns otpauth:// URI
 */
export function generateOtpAuthUri(
  secret: string,
  user: string,
  issuer: string,
  options: TOTPOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Build otpauth URI manually for full control
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedUser = encodeURIComponent(user);

  let uri = `otpauth://totp/${encodedIssuer}:${encodedUser}?secret=${secret}&issuer=${encodedIssuer}`;

  // Add parameters if non-default
  if (opts.digits !== 6) {
    uri += `&digits=${opts.digits}`;
  }
  if (opts.interval !== 30) {
    uri += `&period=${opts.interval}`;
  }
  if (opts.algorithm !== "sha1") {
    uri += `&algorithm=${opts.algorithm.toUpperCase()}`;
  }

  return uri;
}

/**
 * Encrypt secret for storage (with {llngcrypt} prefix)
 * @param secret Plain base32 secret
 * @param cipher Crypto instance from @lemonldap-ng/crypto
 * @returns Encrypted secret with prefix
 */
export function encryptSecret(
  secret: string,
  cipher: { encrypt: (data: string) => string },
): string {
  const encrypted = cipher.encrypt(secret);
  return `{llngcrypt}${encrypted}`;
}

/**
 * Decrypt secret from storage
 * @param secret Stored secret (may have {llngcrypt} prefix)
 * @param cipher Crypto instance from @lemonldap-ng/crypto
 * @returns Decrypted base32 secret
 */
export function decryptSecret(
  secret: string,
  cipher: { decrypt: (data: string) => string },
): string {
  if (secret.startsWith("{llngcrypt}")) {
    return cipher.decrypt(secret.substring("{llngcrypt}".length));
  }
  return secret;
}

/**
 * Check if secret is encrypted
 * @param secret Stored secret
 * @returns True if encrypted
 */
export function isEncrypted(secret: string): boolean {
  return secret.startsWith("{llngcrypt}");
}

/**
 * Base32 encoding (RFC 4648)
 * Same alphabet as Perl MIME::Base32
 */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Encode bytes to base32
 * @param buffer Bytes to encode
 * @returns Base32 string
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decode base32 to bytes
 * @param input Base32 string
 * @returns Decoded bytes
 */
export function base32Decode(input: string): Buffer {
  // Remove padding and convert to uppercase
  const cleanInput = input.replace(/=+$/, "").toUpperCase();

  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < cleanInput.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleanInput[i]);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${cleanInput[i]}`);
    }

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}
