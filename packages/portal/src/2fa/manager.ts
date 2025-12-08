/**
 * 2FA Manager for Portal
 *
 * Manages second factor authentication modules and pending sessions
 *
 * @packageDocumentation
 */

import crypto from "crypto";
import type { LLNG_Conf, LLNG_Logger, LLNG_Session } from "@lemonldap-ng/types";
import type {
  SecondFactorModule,
  SecondFactorRegisterModule,
  TwoFactorChallenge,
  TwoFactorRequest,
  TwoFactorSessionInfo,
  VerifyResult,
  TOTPConfig,
} from "@lemonldap-ng/2fa-common";
import type { TwoFactorPendingState, UserData, Credentials } from "../types";

/**
 * Pending state storage interface
 */
interface PendingStore {
  [token: string]: TwoFactorPendingState;
}

/**
 * 2FA Manager
 * Handles loading 2FA modules and managing pending authentication state
 */
export class TwoFactorManager {
  private conf: LLNG_Conf;
  private logger: LLNG_Logger;
  private modules: Map<string, SecondFactorModule> = new Map();
  private registerModules: Map<string, SecondFactorRegisterModule> = new Map();
  private pendingStore: PendingStore = {};
  private pendingTimeout: number = 300; // 5 minutes default

  constructor(conf: LLNG_Conf, logger: LLNG_Logger) {
    this.conf = conf;
    this.logger = logger;
    this.pendingTimeout = (conf.sfLoginTimeout as number) || 300;
  }

  /**
   * Initialize 2FA modules based on configuration
   */
  async init(): Promise<void> {
    // Load TOTP if activated
    if (this.conf.totp2fActivation) {
      await this.loadTOTPModule();
    }

    // Add other 2FA modules here (Mail2F, WebAuthn, etc.)

    this.logger.info(
      `2FA Manager initialized with ${this.modules.size} modules`,
    );
  }

  /**
   * Load TOTP module
   */
  private async loadTOTPModule(): Promise<void> {
    try {
      const mod = await import("@lemonldap-ng/2fa-totp");
      const totpConfig: TOTPConfig = {
        activation: this.conf.totp2fActivation as boolean | string,
        selfRegistration: this.conf.totp2fSelfRegistration as boolean | string,
        authnLevel: this.conf.totp2fAuthnLevel as number,
        ttl: this.conf.totp2fTTL as number,
        userCanRemove: (this.conf.totp2fUserCanRemove as boolean) ?? true,
        logo: (this.conf.totp2fLogo as string) || "totp.png",
        label: (this.conf.totp2fLabel as string) || "TOTP",
        issuer:
          (this.conf.totp2fIssuer as string) ||
          (this.conf.portal as string) ||
          "LemonLDAP::NG",
        interval: (this.conf.totp2fInterval as number) || 30,
        range: (this.conf.totp2fRange as number) || 1,
        digits: (this.conf.totp2fDigits as number) || 6,
        encryptSecret: (this.conf.totp2fEncryptSecret as boolean) ?? false,
        displayExistingSecret:
          (this.conf.totp2fDisplayExistingSecret as boolean) ?? false,
      };

      // Create verification module
      const verifyModule = await mod.createTOTP2F(totpConfig);
      this.modules.set("totp", verifyModule);

      // Create registration module
      const registerModule = await mod.createTOTPRegister(totpConfig);
      this.registerModules.set("totp", registerModule);

      this.logger.debug("TOTP 2FA module loaded");
    } catch (e) {
      this.logger.error(`Failed to load TOTP module: ${e}`);
    }
  }

  /**
   * Check if 2FA is required for a user
   */
  is2FARequired(session: LLNG_Session): boolean {
    // Check if user has any registered 2FA devices
    const devices = session._2fDevices;
    if (!devices) {
      return false;
    }

    // Parse devices if string
    let deviceList: Array<{ type: string }>;
    try {
      deviceList = typeof devices === "string" ? JSON.parse(devices) : devices;
    } catch {
      return false;
    }

    // Check if any loaded module has devices registered
    for (const [, module] of this.modules) {
      const hasDevice = deviceList.some((d) => d.type === module.type);
      if (hasDevice) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get available 2FA modules for a user
   */
  getAvailableModules(session: LLNG_Session): SecondFactorModule[] {
    const devices = session._2fDevices;
    if (!devices) {
      return [];
    }

    let deviceList: Array<{ type: string }>;
    try {
      deviceList = typeof devices === "string" ? JSON.parse(devices) : devices;
    } catch {
      return [];
    }

    const available: SecondFactorModule[] = [];
    for (const [, module] of this.modules) {
      const hasDevice = deviceList.some((d) => d.type === module.type);
      if (hasDevice) {
        available.push(module);
      }
    }

    return available;
  }

  /**
   * Get a specific 2FA module by prefix
   */
  getModule(prefix: string): SecondFactorModule | undefined {
    return this.modules.get(prefix);
  }

  /**
   * Get a specific registration module by prefix
   */
  getRegisterModule(prefix: string): SecondFactorRegisterModule | undefined {
    return this.registerModules.get(prefix);
  }

  /**
   * Get all loaded modules
   */
  getAllModules(): SecondFactorModule[] {
    return Array.from(this.modules.values());
  }

  /**
   * Get all registration modules
   */
  getAllRegisterModules(): SecondFactorRegisterModule[] {
    return Array.from(this.registerModules.values());
  }

  /**
   * Create a pending 2FA session
   */
  createPendingSession(
    user: string,
    userData: UserData,
    credentials: Credentials,
    availableModules: string[],
    urldc?: string,
  ): string {
    const token = crypto.randomBytes(32).toString("hex");

    this.pendingStore[token] = {
      user,
      userData,
      credentials,
      token,
      availableModules,
      timestamp: Date.now(),
      urldc,
    };

    // Schedule cleanup
    setTimeout(() => {
      this.deletePendingSession(token);
    }, this.pendingTimeout * 1000);

    return token;
  }

  /**
   * Get pending session by token
   */
  getPendingSession(token: string): TwoFactorPendingState | null {
    const session = this.pendingStore[token];
    if (!session) {
      return null;
    }

    // Check expiry
    if (Date.now() - session.timestamp > this.pendingTimeout * 1000) {
      this.deletePendingSession(token);
      return null;
    }

    return session;
  }

  /**
   * Delete pending session
   */
  deletePendingSession(token: string): void {
    delete this.pendingStore[token];
  }

  /**
   * Generate 2FA challenge for a module
   */
  async generateChallenge(
    prefix: string,
    req: TwoFactorRequest,
    sessionInfo: TwoFactorSessionInfo,
    sfToken: string,
  ): Promise<TwoFactorChallenge> {
    const module = this.modules.get(prefix);
    if (!module) {
      throw new Error(`Unknown 2FA module: ${prefix}`);
    }

    return module.run(req, sessionInfo, sfToken);
  }

  /**
   * Verify 2FA response
   */
  async verify(
    prefix: string,
    req: TwoFactorRequest,
    sessionInfo: TwoFactorSessionInfo,
  ): Promise<VerifyResult> {
    const module = this.modules.get(prefix);
    if (!module) {
      return {
        success: false,
        error: `Unknown 2FA module: ${prefix}`,
        code: "PE_BADOTP",
      };
    }

    return module.verify(req, sessionInfo);
  }

  /**
   * Check if 2FA is enabled in configuration
   */
  is2FAEnabled(): boolean {
    return this.modules.size > 0;
  }

  /**
   * Convert session to TwoFactorSessionInfo
   */
  sessionToInfo(session: LLNG_Session): TwoFactorSessionInfo {
    return {
      sessionId: session._session_id || "",
      user: (session.uid as string) || (session._user as string) || "",
      _2fDevices: session._2fDevices as string | undefined,
    };
  }
}

export default TwoFactorManager;
