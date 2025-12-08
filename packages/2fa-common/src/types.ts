/**
 * @lemonldap-ng/2fa-common - Types
 *
 * Common types and interfaces for 2FA modules
 *
 * @packageDocumentation
 */

import type { Request } from "express";

/**
 * 2FA Device types supported by LemonLDAP::NG
 */
export type SecondFactorType =
  | "TOTP"
  | "WebAuthn"
  | "Yubikey"
  | "Mail"
  | "REST"
  | "Radius"
  | "Password"
  | string;

/**
 * 2FA Device stored in session
 * Matches Perl _2fDevices structure
 */
export interface TwoFactorDevice {
  /** Device type (e.g., "TOTP", "WebAuthn") */
  type: SecondFactorType;
  /** User-defined device name */
  name: string;
  /** Registration timestamp (Unix epoch) */
  epoch: number;
  /** Device-specific secret (may be encrypted with {llngcrypt} prefix) */
  _secret?: string;
  /** Optional device ID */
  id?: string;
  /** Additional device-specific properties */
  [key: string]: unknown;
}

/**
 * 2FA configuration parameters
 * Matches Perl configuration keys
 */
export interface TwoFactorConfig {
  /** Activation rule (boolean or expression) */
  activation?: boolean | string;
  /** Self-registration enabled */
  selfRegistration?: boolean | string;
  /** Authentication level after 2FA */
  authnLevel?: number;
  /** Device TTL in seconds (0 = no expiry) */
  ttl?: number;
  /** User can remove registered devices */
  userCanRemove?: boolean;
  /** Logo filename for UI */
  logo?: string;
  /** Display label */
  label?: string;
}

/**
 * TOTP-specific configuration
 */
export interface TOTPConfig extends TwoFactorConfig {
  /** TOTP issuer name (shown in authenticator apps) */
  issuer?: string;
  /** Time step in seconds (default: 30) */
  interval?: number;
  /** Number of time windows to accept for clock skew (default: 1) */
  range?: number;
  /** TOTP code length (6 or 8, default: 6) */
  digits?: number;
  /** Encrypt secrets at rest */
  encryptSecret?: boolean;
  /** Display existing secret to user */
  displayExistingSecret?: boolean;
}

/**
 * Mail 2FA configuration
 */
export interface Mail2FConfig extends TwoFactorConfig {
  /** Code format regex */
  codeRegex?: string;
  /** Code timeout in seconds */
  timeout?: number;
  /** Email subject */
  subject?: string;
  /** Email body template */
  body?: string;
}

/**
 * WebAuthn configuration
 */
export interface WebAuthnConfig extends TwoFactorConfig {
  /** User verification requirement */
  userVerification?: "required" | "preferred" | "discouraged";
  /** Relying party name */
  rpName?: string;
  /** Relying party ID */
  rpId?: string;
  /** Attestation conveyance */
  attestation?: "none" | "indirect" | "direct" | "enterprise";
}

/**
 * Result of 2FA verification
 */
export interface VerifyResult {
  /** Whether verification succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Error code if failed */
  code?: string;
  /** Range offset for TOTP (indicates clock skew) */
  rangeOffset?: number;
  /** Device that was verified */
  device?: TwoFactorDevice;
}

/**
 * Result of 2FA registration
 */
export interface RegisterResult {
  /** Whether registration succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Newly registered device */
  device?: TwoFactorDevice;
}

/**
 * 2FA challenge data returned to client
 */
export interface TwoFactorChallenge {
  /** Challenge type */
  type: SecondFactorType;
  /** One-time token for state */
  token: string;
  /** Challenge-specific data */
  data?: Record<string, unknown>;
  /** HTML template to render */
  template?: string;
}

/**
 * 2FA registration data for new device setup
 */
export interface RegistrationData {
  /** Registration type */
  type: SecondFactorType;
  /** One-time token */
  token: string;
  /** Secret (for TOTP) */
  secret?: string;
  /** QR code URI (for TOTP) */
  qrUri?: string;
  /** Challenge data (for WebAuthn) */
  challenge?: unknown;
  /** Additional registration data */
  [key: string]: unknown;
}

/**
 * Session info for 2FA operations
 */
export interface TwoFactorSessionInfo {
  /** Session ID */
  sessionId: string;
  /** User identifier */
  user: string;
  /** Registered devices (JSON string from _2fDevices) */
  _2fDevices?: string;
  /** Additional session data */
  [key: string]: unknown;
}

/**
 * 2FA Request context
 */
export interface TwoFactorRequest extends Request {
  /** 2FA token */
  sfToken?: string;
  /** Session info */
  sessionInfo?: TwoFactorSessionInfo;
  /** Current 2FA device being verified */
  currentDevice?: TwoFactorDevice;
}

/**
 * Second Factor Module interface
 * Verification module for 2FA challenge
 */
export interface SecondFactorModule {
  /** Module type/prefix (e.g., "totp", "webauthn") */
  readonly prefix: string;
  /** Device type (e.g., "TOTP", "WebAuthn") */
  readonly type: SecondFactorType;
  /** Display logo */
  logo?: string;
  /** Display label */
  label?: string;
  /** Authentication level granted */
  authnLevel?: number;

  /**
   * Initialize module
   */
  init(config: TwoFactorConfig): Promise<void>;

  /**
   * Generate 2FA challenge for user
   * @param req Express request
   * @param session Session info
   * @param token One-time token
   * @returns Challenge data or HTML response
   */
  run(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
    token: string,
  ): Promise<TwoFactorChallenge>;

  /**
   * Verify user's 2FA response
   * @param req Express request with user's response
   * @param session Session info
   * @returns Verification result
   */
  verify(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
  ): Promise<VerifyResult>;
}

/**
 * Second Factor Registration Module interface
 * For device enrollment/registration
 */
export interface SecondFactorRegisterModule {
  /** Module type/prefix */
  readonly prefix: string;
  /** Device type */
  readonly type: SecondFactorType;
  /** Display logo */
  logo?: string;
  /** Display label */
  label?: string;
  /** User can remove devices */
  userCanRemove?: boolean;

  /**
   * Initialize registration module
   */
  init(config: TwoFactorConfig): Promise<void>;

  /**
   * Generate registration data (e.g., TOTP secret, WebAuthn challenge)
   * @param req Express request
   * @param session Session info
   * @returns Registration data including secret/challenge
   */
  getRegistrationData(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
  ): Promise<RegistrationData>;

  /**
   * Verify registration and store device
   * @param req Express request with verification code
   * @param session Session info
   * @param token One-time token from registration
   * @returns Registration result
   */
  verifyRegistration(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
    token: string,
  ): Promise<RegisterResult>;

  /**
   * Delete a registered device
   * @param req Express request
   * @param session Session info
   * @param epoch Device epoch to delete
   * @returns Success status
   */
  deleteDevice?(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
    epoch: number,
  ): Promise<boolean>;

  /**
   * Modify device properties (e.g., rename)
   * @param req Express request
   * @param session Session info
   * @param epoch Device epoch to modify
   * @param updates Properties to update
   * @returns Success status
   */
  modifyDevice?(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
    epoch: number,
    updates: Partial<TwoFactorDevice>,
  ): Promise<boolean>;
}

/**
 * Portal errors related to 2FA
 */
export const PE_OK = 0;
export const PE_BADOTP = 96;
export const PE_FORMEMPTY = 10;
export const PE_FIRSTACCESS = 27;
export const PE_TOKENEXPIRED = 82;
export const PE_NOTOKEN = 83;
export const PE_SENDRESPONSE = -1;
