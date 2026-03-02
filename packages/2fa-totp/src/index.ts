/**
 * @lemonldap-ng/2fa-totp
 *
 * TOTP (Time-based One-Time Password) second factor authentication
 * for LemonLDAP::NG portal
 *
 * Implements RFC 6238 TOTP algorithm compatible with:
 * - Google Authenticator
 * - Microsoft Authenticator
 * - Authy
 * - FreeOTP
 * - And other TOTP-compatible apps
 *
 * @packageDocumentation
 */

// Export TOTP core functions
export {
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
  type TOTPOptions,
  type TOTPVerifyResult,
} from "./totp";

// Export verification module
export { TOTP2F, createTOTP2F } from "./verify";

// Export registration module
export { TOTPRegister, createTOTPRegister } from "./register";

// Re-export common types for convenience
export type {
  TOTPConfig,
  TwoFactorDevice,
  TwoFactorChallenge,
  VerifyResult,
  RegisterResult,
  RegistrationData,
} from "@lemonldap-ng/2fa-common";
