import type { Router } from "express";
import type { LLNG_Conf, LLNG_Logger } from "@lemonldap-ng/types";
import type { PortalRequest } from "../types";
import type { Portal } from "../portal";

/**
 * Plugin result codes (matching Perl PE_* constants)
 */
export const PE_OK = 0;
export const PE_SESSIONEXPIRED = 1;
export const PE_FORMEMPTY = 2;
export const PE_WRONGMANAGERACCOUNT = 3;
export const PE_USERNOTFOUND = 4;
export const PE_BADCREDENTIALS = 5;
export const PE_LDAPCONNECTFAILED = 6;
export const PE_LDAPERROR = 7;
export const PE_APACHESESSIONERROR = 8;
export const PE_FIRSTACCESS = 9;
export const PE_BADCERTIFICATE = 10;
export const PE_ERROR = 24;
export const PE_BADURL = 37;
export const PE_UNPROTECTEDURL = 109;

/**
 * Result from a plugin hook
 */
export interface PluginResult {
  /** Result code (PE_OK = 0 means continue, other values may halt) */
  code: number;
  /** Optional error message */
  error?: string;
  /** Whether to stop processing further plugins */
  stop?: boolean;
}

/**
 * Context passed to plugin initialization
 */
export interface PluginContext {
  /** Portal instance */
  portal: Portal;
  /** Configuration */
  conf: LLNG_Conf;
  /** Logger */
  logger: LLNG_Logger;
}

/**
 * Plugin interface - all plugins must implement this
 */
export interface Plugin {
  /** Plugin name */
  readonly name: string;

  /** Initialize the plugin */
  init(context: PluginContext): Promise<boolean>;

  // ========== Lifecycle Hooks (all optional) ==========

  /** Called before authentication starts */
  beforeAuth?(req: PortalRequest): Promise<PluginResult>;

  /** Called between authentication and user data retrieval */
  betweenAuthAndData?(req: PortalRequest): Promise<PluginResult>;

  /** Called after user data is retrieved */
  afterData?(req: PortalRequest): Promise<PluginResult>;

  /** Called at the end of authentication process */
  endAuth?(req: PortalRequest): Promise<PluginResult>;

  /** Called before logout */
  beforeLogout?(req: PortalRequest): Promise<PluginResult>;

  /** Called for an already authenticated user visiting the portal */
  forAuthUser?(req: PortalRequest): Promise<PluginResult>;

  // ========== Route Registration (optional) ==========

  /** Register routes (all types) */
  registerRoutes?(router: Router): void;

  /** Register routes that require authentication */
  registerAuthRoutes?(router: Router): void;

  /** Register routes that don't require authentication */
  registerUnauthRoutes?(router: Router): void;

  // ========== Cleanup (optional) ==========

  /** Cleanup resources */
  close?(): Promise<void>;
}

/**
 * Plugin registration entry (for the registry)
 */
export interface PluginRegistration {
  /** Configuration key(s) that enable this plugin */
  configKeys: string | string[];

  /** NPM package name */
  packageName: string;

  /** Compound condition (for multiple config keys with OR/AND) */
  compoundCondition?: {
    type: "or" | "and";
    keys: string[];
  };

  /** Wildcard path condition (like 'or::path/star/key' in Perl) */
  wildcardPath?: {
    type: "or" | "and";
    path: string;
  };

  /** Priority - higher values load later (e.g., Impersonation = 1000) */
  priority?: number;
}

/**
 * Plugin module export interface
 * Plugins should export either a class or a factory function
 */
export interface PluginModule {
  default: new () => Plugin;
  // Or a factory function
  createPlugin?: () => Plugin;
}

/**
 * Helper to create a successful plugin result
 */
export function ok(): PluginResult {
  return { code: PE_OK };
}

/**
 * Helper to create an error plugin result
 */
export function error(code: number, message?: string, stop = false): PluginResult {
  return { code, error: message, stop };
}
