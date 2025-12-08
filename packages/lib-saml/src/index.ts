/**
 * @lemonldap-ng/lib-saml
 *
 * SAML utilities and server management for LemonLDAP::NG
 *
 * @packageDocumentation
 */

// Export types
export * from "./types";

// Export ServerManager
export { ServerManager, type ServerManagerConfig } from "./server-manager";

// Export utilities
export {
  bindingToHttpMethod,
  httpMethodToBinding,
  nameIdFormatToUrn,
  urnToNameIdFormat,
  signatureMethodToEnum,
  detectHttpMethod,
  extractSamlMessage,
  decodeSamlMessage,
  generateSamlId,
  generateIsoTimestamp,
  parseIsoTimestamp,
  isTimestampValid,
  buildPostForm,
  escapeHtml,
  escapeXml,
  buildUrl,
  parseQueryString,
} from "./utils";

// Export lasso loader utilities
export {
  loadLasso,
  getLasso,
  isLassoLoaded,
  tryLoadLassoSync,
  LassoNotAvailableError,
  HttpMethod,
  SignatureMethod,
  NameIdFormat,
  AuthnContext,
} from "./lasso-loader";

// Re-export lasso types with full names
export type {
  LassoServer,
  LassoLogin,
  LassoLogout,
  LassoIdentity,
  LassoSession,
  HttpMethodType,
  SignatureMethodType,
} from "./lasso-loader";

// Backward-compatible type aliases (without Lasso prefix)
export type { LassoLogin as Login } from "./lasso-loader";
export type { LassoLogout as Logout } from "./lasso-loader";
export type { LassoIdentity as Identity } from "./lasso-loader";
export type { LassoSession as Session } from "./lasso-loader";
