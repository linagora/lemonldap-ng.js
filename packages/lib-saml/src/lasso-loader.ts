/**
 * Dynamic loader for lasso.js (optional dependency)
 *
 * This module handles the dynamic import of lasso.js, which is an optional
 * native dependency. If lasso.js is not installed (e.g., missing liblasso3-dev),
 * this module will provide a clear error message at runtime when SAML features
 * are used.
 */

// Type imports (these are always safe - no runtime dependency)
import type {
  Server as LassoServer,
  Login as LassoLogin,
  Logout as LassoLogout,
  Identity as LassoIdentity,
  Session as LassoSession,
  ProviderInfo,
  MessageResult,
  SamlAttribute,
  ProviderOptions,
  ServerOptions,
  NameIdFormatType,
  AuthnContextType,
} from "lasso.js";

// Re-export types (safe - no runtime)
export type {
  LassoServer,
  LassoLogin,
  LassoLogout,
  LassoIdentity,
  LassoSession,
  ProviderInfo,
  MessageResult,
  SamlAttribute,
  ProviderOptions,
  ServerOptions,
  NameIdFormatType,
  AuthnContextType,
};

// Cached lasso module
let lassoModule: typeof import("lasso.js") | null = null;
let loadError: Error | null = null;

/**
 * Error thrown when lasso.js is not available
 */
export class LassoNotAvailableError extends Error {
  constructor(originalError?: Error) {
    super(
      "SAML support requires lasso.js which is not installed. " +
        "Please install liblasso3-dev (or equivalent) and run 'npm rebuild lasso.js'. " +
        (originalError ? `Original error: ${originalError.message}` : ""),
    );
    this.name = "LassoNotAvailableError";
  }
}

/**
 * Load lasso.js dynamically
 * Returns the lasso module or throws LassoNotAvailableError
 */
export async function loadLasso(): Promise<typeof import("lasso.js")> {
  // Return cached module if already loaded
  if (lassoModule) {
    return lassoModule;
  }

  // Return cached error if already failed
  if (loadError) {
    throw new LassoNotAvailableError(loadError);
  }

  try {
    lassoModule = await import("lasso.js");
    return lassoModule;
  } catch (err) {
    loadError = err instanceof Error ? err : new Error(String(err));
    throw new LassoNotAvailableError(loadError);
  }
}

/**
 * Check if lasso.js is available (synchronous check after first load)
 */
export function isLassoLoaded(): boolean {
  return lassoModule !== null;
}

/**
 * Get the loaded lasso module (throws if not loaded)
 */
export function getLasso(): typeof import("lasso.js") {
  if (!lassoModule) {
    throw new LassoNotAvailableError(
      loadError || new Error("Lasso not loaded. Call loadLasso() first."),
    );
  }
  return lassoModule;
}

/**
 * Try to load lasso.js synchronously (for initial check)
 * Returns true if available, false otherwise
 */
export function tryLoadLassoSync(): boolean {
  if (lassoModule) return true;
  if (loadError) return false;

  try {
    lassoModule = require("lasso.js");
    return true;
  } catch (err) {
    loadError = err instanceof Error ? err : new Error(String(err));
    return false;
  }
}

// Define enum values as constants (same as lasso.js but local)
// These are used when lasso.js is not available for type checking

export const HttpMethod = {
  NONE: 0,
  ANY: 1,
  IDP_INITIATED: 2,
  GET: 3,
  POST: 4,
  REDIRECT: 5,
  SOAP: 6,
  ARTIFACT_GET: 7,
  ARTIFACT_POST: 8,
  PAOS: 9,
} as const;

export type HttpMethodType = (typeof HttpMethod)[keyof typeof HttpMethod];

export const SignatureMethod = {
  RSA_SHA1: 1,
  RSA_SHA256: 2,
  RSA_SHA384: 3,
  RSA_SHA512: 4,
} as const;

export type SignatureMethodType =
  (typeof SignatureMethod)[keyof typeof SignatureMethod];

export const NameIdFormat = {
  NONE: "",
  UNSPECIFIED: "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
  EMAIL: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
  X509: "urn:oasis:names:tc:SAML:1.1:nameid-format:X509SubjectName",
  WINDOWS:
    "urn:oasis:names:tc:SAML:1.1:nameid-format:WindowsDomainQualifiedName",
  KERBEROS: "urn:oasis:names:tc:SAML:2.0:nameid-format:kerberos",
  ENTITY: "urn:oasis:names:tc:SAML:2.0:nameid-format:entity",
  PERSISTENT: "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
  TRANSIENT: "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
  ENCRYPTED: "urn:oasis:names:tc:SAML:2.0:nameid-format:encrypted",
} as const;

export const AuthnContext = {
  UNSPECIFIED: "urn:oasis:names:tc:SAML:2.0:ac:classes:unspecified",
  PASSWORD: "urn:oasis:names:tc:SAML:2.0:ac:classes:Password",
  PASSWORD_PROTECTED:
    "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
  TLS_CLIENT: "urn:oasis:names:tc:SAML:2.0:ac:classes:TLSClient",
  X509: "urn:oasis:names:tc:SAML:2.0:ac:classes:X509",
  SMARTCARD: "urn:oasis:names:tc:SAML:2.0:ac:classes:Smartcard",
  KERBEROS: "urn:oasis:names:tc:SAML:2.0:ac:classes:Kerberos",
} as const;
