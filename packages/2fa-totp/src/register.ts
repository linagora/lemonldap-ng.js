/**
 * @lemonldap-ng/2fa-totp - TOTP Registration Module
 *
 * Self-registration module for TOTP devices
 * Equivalent to Perl Lemonldap::NG::Portal::2F::Register::TOTP
 *
 * @packageDocumentation
 */

import {
  BaseSecondFactorRegister,
  type TOTPConfig,
  type TwoFactorRequest,
  type TwoFactorSessionInfo,
  type RegistrationData,
  type RegisterResult,
  type TwoFactorDevice,
  type OneTimeTokenManager,
  InMemoryTokenManager,
  sanitizeDeviceName,
  generateDefaultName,
} from "@lemonldap-ng/2fa-common";
import {
  generateSecret,
  generateOtpAuthUri,
  verifyCode,
  encryptSecret,
  DEFAULT_OPTIONS,
} from "./totp";

/**
 * Token data stored during registration
 */
interface RegistrationToken extends Record<string, unknown> {
  _totp2fSecret: string;
  user: string;
  _utime?: number;
}

/**
 * TOTP Registration Module
 * Handles TOTP device enrollment
 */
export class TOTPRegister extends BaseSecondFactorRegister {
  readonly prefix = "totp";
  readonly type = "TOTP";

  private totpConfig: TOTPConfig = {};
  private tokenManager: OneTimeTokenManager;
  private cipher?: { encrypt: (data: string) => string };
  private getIssuer: () => string = () => "LemonLDAP::NG";

  constructor(tokenManager?: OneTimeTokenManager) {
    super();
    this.tokenManager = tokenManager ?? new InMemoryTokenManager();
  }

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
      displayExistingSecret: config.displayExistingSecret ?? false,
      ...config,
    };

    this.logo = config.logo ?? "totp.png";
    this.label = config.label ?? "TOTP";
    this.userCanRemove = config.userCanRemove ?? true;

    if (config.issuer) {
      this.getIssuer = () => config.issuer!;
    }
  }

  /**
   * Set token manager for storing registration state
   */
  setTokenManager(tokenManager: OneTimeTokenManager): void {
    this.tokenManager = tokenManager;
  }

  /**
   * Set cipher for secret encryption
   */
  setCipher(cipher: { encrypt: (data: string) => string }): void {
    this.cipher = cipher;
  }

  /**
   * Set issuer getter function
   */
  setIssuerGetter(getter: () => string): void {
    this.getIssuer = getter;
  }

  /**
   * Generate registration data for new TOTP device
   * Called when user initiates registration
   */
  async getRegistrationData(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
  ): Promise<RegistrationData> {
    // Generate new secret
    const secret = generateSecret();
    const user = session.user;
    const issuer = this.getIssuer();

    // Create one-time token to store secret
    const token = await this.tokenManager.createToken({
      _totp2fSecret: secret,
      user,
    } as RegistrationToken);

    // Generate otpauth URI for QR code
    const qrUri = generateOtpAuthUri(secret, user, issuer, {
      interval: this.totpConfig.interval,
      digits: this.totpConfig.digits,
    });

    return {
      type: this.type,
      token,
      secret, // Client needs this to display QR code
      qrUri,
      issuer,
      user,
      digits: this.totpConfig.digits ?? DEFAULT_OPTIONS.digits,
      interval: this.totpConfig.interval ?? DEFAULT_OPTIONS.interval,
    };
  }

  /**
   * Verify registration code and store device
   * Called when user submits TOTP code from authenticator app
   */
  async verifyRegistration(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
    token: string,
  ): Promise<RegisterResult> {
    // Get code and device name from request
    const code = req.body?.code || req.body?.totp;
    const deviceName =
      req.body?.TOTPName ||
      req.body?.deviceName ||
      generateDefaultName(this.type, this.getDevices(session).length + 1);

    if (!code) {
      return {
        success: false,
        error: "No verification code provided",
      };
    }

    // Retrieve token data (keep=true to allow retries)
    const tokenData = (await this.tokenManager.getToken(
      token,
      true,
    )) as RegistrationToken | null;

    if (!tokenData) {
      return {
        success: false,
        error: "Registration token expired or invalid",
      };
    }

    const secret = tokenData._totp2fSecret;

    // Verify the code
    const result = verifyCode(secret, code, {
      interval: this.totpConfig.interval,
      range: this.totpConfig.range,
      digits: this.totpConfig.digits,
    });

    if (!result.valid) {
      return {
        success: false,
        error: "Invalid TOTP code",
      };
    }

    // Delete token after successful verification
    await this.tokenManager.deleteToken(token);

    // Encrypt secret if configured
    let storableSecret = secret;
    if (this.totpConfig.encryptSecret && this.cipher) {
      storableSecret = encryptSecret(secret, this.cipher);
    }

    // Create device record
    const device: TwoFactorDevice = {
      type: this.type,
      name: sanitizeDeviceName(deviceName),
      epoch: Math.floor(Date.now() / 1000),
      _secret: storableSecret,
    };

    // Register device
    this.registerDevice(session, device);

    return {
      success: true,
      device,
    };
  }

  /**
   * Handle registration actions (getkey, verify, delete, modify)
   * Main entry point for registration routes
   */
  async handleAction(
    action: string,
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
  ): Promise<{
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
  }> {
    switch (action) {
      case "getkey": {
        const regData = await this.getRegistrationData(req, session);
        return {
          success: true,
          data: regData as unknown as Record<string, unknown>,
        };
      }

      case "verify": {
        const token = req.body?.token;
        if (!token) {
          return { success: false, error: "No token provided" };
        }
        const result = await this.verifyRegistration(req, session, token);
        if (result.success) {
          return {
            success: true,
            data: { device: result.device },
          };
        }
        return { success: false, error: result.error };
      }

      case "delete": {
        const epoch = parseInt(req.body?.epoch, 10);
        if (isNaN(epoch)) {
          return { success: false, error: "Invalid epoch" };
        }
        const deleted = await this.deleteDevice(req, session, epoch);
        return {
          success: deleted,
          error: deleted ? undefined : "Device not found",
        };
      }

      case "modify": {
        const epoch = parseInt(req.body?.epoch, 10);
        const name = req.body?.name;
        if (isNaN(epoch)) {
          return { success: false, error: "Invalid epoch" };
        }
        if (!name) {
          return { success: false, error: "No name provided" };
        }
        const modified = await this.modifyDevice(req, session, epoch, { name });
        return {
          success: modified,
          error: modified ? undefined : "Device not found",
        };
      }

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }
}

/**
 * Create TOTP registration module with configuration
 */
export async function createTOTPRegister(
  config: TOTPConfig,
  tokenManager?: OneTimeTokenManager,
): Promise<TOTPRegister> {
  const module = new TOTPRegister(tokenManager);
  await module.init(config);
  return module;
}
