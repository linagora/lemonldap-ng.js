/**
 * @lemonldap-ng/2fa-totp - TOTP Verification Module
 *
 * Second factor verification module for TOTP
 * Equivalent to Perl Lemonldap::NG::Portal::2F::TOTP
 *
 * @packageDocumentation
 */

import {
  BaseSecondFactor,
  type TOTPConfig,
  type TwoFactorChallenge,
  type TwoFactorRequest,
  type TwoFactorSessionInfo,
  type VerifyResult,
  type TwoFactorDevice,
  DeviceRegistry,
} from "@lemonldap-ng/2fa-common";
import { verifyCode, decryptSecret, DEFAULT_OPTIONS } from "./totp";

/**
 * TOTP Second Factor Module
 * Handles TOTP verification during authentication
 */
export class TOTP2F extends BaseSecondFactor {
  readonly prefix = "totp";
  readonly type = "TOTP";

  private totpConfig: TOTPConfig = {};
  private cipher?: { decrypt: (data: string) => string };

  /**
   * Initialize with TOTP configuration
   */
  async init(config: TOTPConfig): Promise<void> {
    await super.init(config);

    this.totpConfig = {
      interval: config.interval ?? DEFAULT_OPTIONS.interval,
      range: config.range ?? DEFAULT_OPTIONS.range,
      digits: config.digits ?? DEFAULT_OPTIONS.digits,
      encryptSecret: config.encryptSecret ?? false,
      issuer: config.issuer,
      ...config,
    };

    this.logo = config.logo ?? "totp.png";
    this.label = config.label ?? "TOTP";
  }

  /**
   * Set cipher for secret decryption
   */
  setCipher(cipher: { decrypt: (data: string) => string }): void {
    this.cipher = cipher;
  }

  /**
   * Generate TOTP verification challenge
   * Returns data needed to display verification form
   */
  async run(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
    token: string,
  ): Promise<TwoFactorChallenge> {
    const devices = this.getDevices(session);

    if (devices.length === 0) {
      throw new Error("No TOTP device registered");
    }

    return {
      type: this.type,
      token,
      template: "totp2fcheck",
      data: {
        prefix: this.prefix,
        logo: this.logo,
        label: this.label,
        // Don't expose device secrets
        deviceCount: devices.length,
      },
    };
  }

  /**
   * Verify TOTP code submitted by user
   */
  async verify(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
  ): Promise<VerifyResult> {
    // Get code from request body
    const code = req.body?.code || req.body?.totp;

    if (!code) {
      return {
        success: false,
        error: "No TOTP code provided",
        code: "PE_FORMEMPTY",
      };
    }

    const devices = this.getDevices(session);

    if (devices.length === 0) {
      return {
        success: false,
        error: "No TOTP device registered",
        code: "PE_BADOTP",
      };
    }

    // Try each registered device
    for (const device of devices) {
      const secret = device._secret;
      if (!secret) continue;

      // Decrypt if needed
      let clearSecret: string;
      try {
        if (this.totpConfig.encryptSecret && this.cipher) {
          clearSecret = decryptSecret(secret, this.cipher);
        } else {
          clearSecret = secret;
        }
      } catch (e) {
        console.warn("Failed to decrypt TOTP secret:", e);
        continue;
      }

      // Verify code
      const result = verifyCode(clearSecret, code, {
        interval: this.totpConfig.interval,
        range: this.totpConfig.range,
        digits: this.totpConfig.digits,
      });

      if (result.valid) {
        return {
          success: true,
          rangeOffset: result.delta,
          device,
        };
      }
    }

    return {
      success: false,
      error: "Invalid TOTP code",
      code: "PE_BADOTP",
    };
  }

  /**
   * Get TOTP devices from session
   */
  protected override getDevices(
    session: TwoFactorSessionInfo,
  ): TwoFactorDevice[] {
    const registry = new DeviceRegistry(session);

    // Remove expired devices if TTL is set
    if (this.totpConfig.ttl && this.totpConfig.ttl > 0) {
      registry.removeExpired(this.type, this.totpConfig.ttl);
    }

    return registry.getByType(this.type);
  }
}

/**
 * Create TOTP verification module with configuration
 */
export async function createTOTP2F(config: TOTPConfig): Promise<TOTP2F> {
  const module = new TOTP2F();
  await module.init(config);
  return module;
}
