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
  // SOAP utilities
  extractSamlFromSoap,
  wrapInSoapEnvelope,
  isSoapEnvelope,
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
  // Runtime class wrappers
  Login,
  Logout,
  Identity,
  Session,
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
