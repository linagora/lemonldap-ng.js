/**
 * Common base classes and utilities for LemonLDAP::NG plugins
 */

import type { Router } from "express";
import type { LLNG_Conf, LLNG_Logger } from "@lemonldap-ng/types";

// Re-export portal types for convenience
// These are dynamically imported to avoid circular dependencies
export type { Plugin, PluginResult, PluginContext, PluginRegistration } from "@lemonldap-ng/portal";
export { PE_OK, PE_ERROR, PE_BADCREDENTIALS, ok, error } from "@lemonldap-ng/portal";

/**
 * Abstract base class for plugins
 * Provides common functionality and structure for plugin implementations
 */
export abstract class BasePlugin {
  abstract readonly name: string;

  protected conf!: LLNG_Conf;
  protected logger!: LLNG_Logger;
  protected portal: any; // Portal type - avoid circular import

  /**
   * Initialize the plugin
   * Override this method to add custom initialization logic
   */
  async init(context: { portal: any; conf: LLNG_Conf; logger: LLNG_Logger }): Promise<boolean> {
    this.portal = context.portal;
    this.conf = context.conf;
    this.logger = context.logger;

    // Call subclass initialization
    return this.onInit();
  }

  /**
   * Override this method to perform custom initialization
   * @returns true if initialization succeeded, false to skip plugin
   */
  protected async onInit(): Promise<boolean> {
    return true;
  }

  /**
   * Helper to log debug messages
   */
  protected debug(message: string): void {
    this.logger?.debug(`[${this.name}] ${message}`);
  }

  /**
   * Helper to log info messages
   */
  protected info(message: string): void {
    this.logger?.info(`[${this.name}] ${message}`);
  }

  /**
   * Helper to log warning messages
   */
  protected warn(message: string): void {
    this.logger?.warn(`[${this.name}] ${message}`);
  }

  /**
   * Helper to log error messages
   */
  protected error(message: string): void {
    this.logger?.error(`[${this.name}] ${message}`);
  }

  /**
   * Get a configuration value with optional default
   */
  protected getConf<T>(key: string, defaultValue?: T): T {
    const value = (this.conf as any)?.[key];
    return value !== undefined ? value : (defaultValue as T);
  }

  /**
   * Optional: Override to register routes
   */
  registerRoutes?(_router: Router): void;

  /**
   * Optional: Override to register authenticated routes
   */
  registerAuthRoutes?(_router: Router): void;

  /**
   * Optional: Override to register unauthenticated routes
   */
  registerUnauthRoutes?(_router: Router): void;

  /**
   * Optional: Override to cleanup resources
   */
  async close(): Promise<void> {
    // Default: no cleanup needed
  }
}

export default BasePlugin;
