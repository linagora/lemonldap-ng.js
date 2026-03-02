/**
 * Plugin system for LemonLDAP::NG JavaScript Portal
 *
 * This module provides:
 * - Plugin interface and types
 * - PluginManager for loading and executing plugins
 * - Plugin registry for configuration-based plugin discovery
 * - Config checker utilities for enabling plugins
 */

// Types and constants
export {
  // Result codes
  PE_OK,
  PE_SESSIONEXPIRED,
  PE_FORMEMPTY,
  PE_WRONGMANAGERACCOUNT,
  PE_USERNOTFOUND,
  PE_BADCREDENTIALS,
  PE_LDAPCONNECTFAILED,
  PE_LDAPERROR,
  PE_APACHESESSIONERROR,
  PE_FIRSTACCESS,
  PE_BADCERTIFICATE,
  PE_ERROR,
  PE_BADURL,
  PE_UNPROTECTEDURL,
  // Types
  type Plugin,
  type PluginResult,
  type PluginContext,
  type PluginRegistration,
  type PluginModule,
  // Helpers
  ok,
  error,
} from "./types";

// Config checker
export {
  checkConf,
  parseConfigCondition,
  shouldEnablePlugin,
} from "./config-checker";

// Registry
export { pluginRegistry, getSortedRegistry, registerPlugin } from "./registry";

// Manager
export { PluginManager } from "./manager";
export { PluginManager as default } from "./manager";
