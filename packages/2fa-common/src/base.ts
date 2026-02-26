/**
 * @lemonldap-ng/2fa-common - Base Classes
 *
 * Abstract base classes for 2FA verification and registration modules
 *
 * @packageDocumentation
 */

import type {
  SecondFactorModule,
  SecondFactorRegisterModule,
  SecondFactorType,
  TwoFactorConfig,
  TwoFactorChallenge,
  TwoFactorRequest,
  TwoFactorSessionInfo,
  VerifyResult,
  RegistrationData,
  RegisterResult,
  TwoFactorDevice,
} from "./types";
import { DeviceRegistry, sanitizeDeviceName } from "./devices";

/**
 * Abstract base class for 2FA verification modules
 */
export abstract class BaseSecondFactor implements SecondFactorModule {
  abstract readonly prefix: string;
  abstract readonly type: SecondFactorType;

  logo?: string;
  label?: string;
  authnLevel?: number;

  protected config: TwoFactorConfig = {};

  /**
   * Initialize the module with configuration
   */
  async init(config: TwoFactorConfig): Promise<void> {
    this.config = config;
    this.logo = config.logo;
    this.label = config.label;
    this.authnLevel = config.authnLevel;
  }

  /**
   * Generate 2FA challenge
   * Override in subclass
   */
  abstract run(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
    token: string,
  ): Promise<TwoFactorChallenge>;

  /**
   * Verify 2FA response
   * Override in subclass
   */
  abstract verify(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
  ): Promise<VerifyResult>;

  /**
   * Get devices of this type from session
   */
  protected getDevices(session: TwoFactorSessionInfo): TwoFactorDevice[] {
    const registry = new DeviceRegistry(session);
    return registry.getByType(this.type);
  }

  /**
   * Check if user has devices of this type
   */
  protected hasDevices(session: TwoFactorSessionInfo): boolean {
    return this.getDevices(session).length > 0;
  }
}

/**
 * Abstract base class for 2FA registration modules
 */
export abstract class BaseSecondFactorRegister implements SecondFactorRegisterModule {
  abstract readonly prefix: string;
  abstract readonly type: SecondFactorType;

  logo?: string;
  label?: string;
  userCanRemove = true;

  protected config: TwoFactorConfig = {};

  /**
   * Initialize the registration module with configuration
   */
  async init(config: TwoFactorConfig): Promise<void> {
    this.config = config;
    this.logo = config.logo;
    this.label = config.label;
    this.userCanRemove = config.userCanRemove ?? true;
  }

  /**
   * Generate registration data
   * Override in subclass
   */
  abstract getRegistrationData(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
  ): Promise<RegistrationData>;

  /**
   * Verify registration and store device
   * Override in subclass
   */
  abstract verifyRegistration(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
    token: string,
  ): Promise<RegisterResult>;

  /**
   * Delete a device
   */
  async deleteDevice(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
    epoch: number,
  ): Promise<boolean> {
    if (!this.userCanRemove) {
      return false;
    }

    const registry = new DeviceRegistry(session);
    return registry.remove(this.type, epoch);
  }

  /**
   * Modify device properties (e.g., rename)
   */
  async modifyDevice(
    req: TwoFactorRequest,
    session: TwoFactorSessionInfo,
    epoch: number,
    updates: Partial<TwoFactorDevice>,
  ): Promise<boolean> {
    // Only allow name updates by default
    const allowedUpdates: Partial<TwoFactorDevice> = {};
    if (updates.name) {
      allowedUpdates.name = sanitizeDeviceName(updates.name);
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return false;
    }

    const registry = new DeviceRegistry(session);
    return registry.update(this.type, epoch, allowedUpdates);
  }

  /**
   * Register a new device
   */
  protected registerDevice(
    session: TwoFactorSessionInfo,
    device: TwoFactorDevice,
  ): string {
    const registry = new DeviceRegistry(session);
    return registry.add(device);
  }

  /**
   * Get existing devices of this type
   */
  protected getDevices(session: TwoFactorSessionInfo): TwoFactorDevice[] {
    const registry = new DeviceRegistry(session);
    return registry.getByType(this.type);
  }
}

/**
 * One-Time Token manager interface
 * For managing temporary tokens during 2FA flows
 */
export interface OneTimeTokenManager {
  /**
   * Create a new one-time token
   * @param data Data to store in token
   * @param timeout Token timeout in seconds
   * @returns Token ID
   */
  createToken(data: Record<string, unknown>, timeout?: number): Promise<string>;

  /**
   * Get token data
   * @param tokenId Token ID
   * @param keep If true, don't delete token (allow retries)
   * @returns Token data or null if expired/not found
   */
  getToken(
    tokenId: string,
    keep?: boolean,
  ): Promise<Record<string, unknown> | null>;

  /**
   * Update token data
   * @param tokenId Token ID
   * @param key Key to update
   * @param value New value
   * @returns Success status
   */
  updateToken(tokenId: string, key: string, value: unknown): Promise<boolean>;

  /**
   * Delete token
   * @param tokenId Token ID
   */
  deleteToken(tokenId: string): Promise<void>;
}

/**
 * Simple in-memory token manager for testing
 * In production, use session storage backend
 */
export class InMemoryTokenManager implements OneTimeTokenManager {
  private tokens = new Map<
    string,
    { data: Record<string, unknown>; expires: number }
  >();
  private defaultTimeout = 120; // 2 minutes

  async createToken(
    data: Record<string, unknown>,
    timeout?: number,
  ): Promise<string> {
    // Clean expired tokens
    this.cleanExpired();

    const tokenId = this.generateId();
    const expires = Date.now() + (timeout ?? this.defaultTimeout) * 1000;

    this.tokens.set(tokenId, {
      data: { ...data, _utime: Math.floor(Date.now() / 1000) },
      expires,
    });

    return tokenId;
  }

  async getToken(
    tokenId: string,
    keep = false,
  ): Promise<Record<string, unknown> | null> {
    const entry = this.tokens.get(tokenId);

    if (!entry || entry.expires < Date.now()) {
      this.tokens.delete(tokenId);
      return null;
    }

    if (!keep) {
      this.tokens.delete(tokenId);
    }

    return entry.data;
  }

  async updateToken(
    tokenId: string,
    key: string,
    value: unknown,
  ): Promise<boolean> {
    const entry = this.tokens.get(tokenId);
    if (!entry || entry.expires < Date.now()) {
      return false;
    }

    entry.data[key] = value;
    return true;
  }

  async deleteToken(tokenId: string): Promise<void> {
    this.tokens.delete(tokenId);
  }

  private generateId(): string {
    const bytes = new Uint8Array(32);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      // Node.js fallback
      const nodeCrypto = require("crypto");
      const randomBytes = nodeCrypto.randomBytes(32);
      bytes.set(randomBytes);
    }
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.tokens) {
      if (entry.expires < now) {
        this.tokens.delete(id);
      }
    }
  }
}
