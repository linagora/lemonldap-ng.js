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

/**
 * Runtime class wrappers that delegate to lasso.js classes
 * These allow using Login, Logout, Identity, Session as values
 * while keeping lasso.js as an optional dependency
 */

/**
 * Login class wrapper - delegates to lasso.js Login
 */
export class Login {
  private _login: LassoLogin;

  constructor(server: LassoServer) {
    const lasso = getLasso();
    this._login = new lasso.Login(server);
  }

  processAuthnRequestMsg(message: string, method: HttpMethodType): void {
    // Cast method to any to bridge our const type with lasso.js enum
    this._login.processAuthnRequestMsg(message, method as number);
  }

  validateRequestMsg(): void {
    this._login.validateRequestMsg();
  }

  setNameId(nameId: string, format: NameIdFormatType): void {
    this._login.setNameId(nameId, format);
  }

  setAttributes(attributes: SamlAttribute[]): void {
    this._login.setAttributes(attributes);
  }

  buildAssertion(authnContext: string, authTime: string): void {
    this._login.buildAssertion(authnContext, authTime);
  }

  buildResponseMsg(): MessageResult {
    return this._login.buildResponseMsg();
  }

  // SP methods

  /**
   * Initialize an AuthnRequest (SP)
   * @param providerId - Target IdP entity ID (optional)
   * @param method - HTTP method to use (optional)
   */
  initAuthnRequest(providerId?: string, method?: HttpMethodType): void {
    this._login.initAuthnRequest(providerId, method as number);
  }

  /**
   * Build the AuthnRequest message (SP)
   */
  buildAuthnRequestMsg(): MessageResult {
    return this._login.buildAuthnRequestMsg();
  }

  /**
   * Process a SAML Response (SP)
   * @param message - The SAML Response
   */
  processResponseMsg(message: string): void {
    this._login.processResponseMsg(message);
  }

  /**
   * Accept the SSO (SP)
   */
  acceptSso(): void {
    this._login.acceptSso();
  }

  get remoteProviderId(): string | undefined {
    return this._login.remoteProviderId ?? undefined;
  }

  /** Name ID from assertion */
  get nameId(): string | undefined {
    return this._login.nameId ?? undefined;
  }

  /** RelayState value */
  get relayState(): string | undefined {
    return this._login.relayState ?? undefined;
  }

  set relayState(value: string | undefined) {
    this._login.relayState = value ?? null;
  }

  /** Message URL after building */
  get msgUrl(): string | undefined {
    return this._login.msgUrl ?? undefined;
  }

  /** Message body after building */
  get msgBody(): string | undefined {
    return this._login.msgBody ?? undefined;
  }

  get nameIdFormat(): string | undefined {
    return this._login.nameIdFormat ?? undefined;
  }

  get identity(): Identity | undefined {
    const ident = this._login.identity;
    if (!ident) return undefined;
    // Wrap in our Identity class
    return Identity._fromLasso(ident);
  }

  set identity(value: Identity | LassoIdentity | undefined) {
    if (!value) {
      this._login.identity = null;
    } else if (value instanceof Identity) {
      this._login.identity = value.inner;
    } else {
      this._login.identity = value;
    }
  }

  get session(): Session | undefined {
    const sess = this._login.session;
    if (!sess) return undefined;
    // Wrap in our Session class
    return Session._fromLasso(sess);
  }

  set session(value: Session | LassoSession | undefined) {
    if (!value) {
      this._login.session = null;
    } else if (value instanceof Session) {
      this._login.session = value.inner;
    } else {
      this._login.session = value;
    }
  }
}

/**
 * Logout class wrapper - delegates to lasso.js Logout
 */
export class Logout {
  private _logout: LassoLogout;

  constructor(server: LassoServer) {
    const lasso = getLasso();
    this._logout = new lasso.Logout(server);
  }

  processRequestMsg(message: string, method: HttpMethodType): void {
    // Cast method to number to bridge our const type with lasso.js enum
    this._logout.processRequestMsg(message, method as number);
  }

  processResponseMsg(message: string): void {
    this._logout.processResponseMsg(message);
  }

  validateRequest(): void {
    this._logout.validateRequest();
  }

  initRequest(providerId: string, method: HttpMethodType): void {
    // Cast method to number to bridge our const type with lasso.js enum
    this._logout.initRequest(providerId, method as number);
  }

  buildRequestMsg(): MessageResult {
    return this._logout.buildRequestMsg();
  }

  buildResponseMsg(): MessageResult {
    return this._logout.buildResponseMsg();
  }

  getNextProviderId(): string | null {
    return this._logout.getNextProviderId();
  }

  get remoteProviderId(): string | undefined {
    // Access via any to handle potential type mismatch
    return (this._logout as { remoteProviderId?: string }).remoteProviderId;
  }

  get identity(): Identity | undefined {
    const ident = this._logout.identity;
    if (!ident) return undefined;
    return Identity._fromLasso(ident);
  }

  set identity(value: Identity | LassoIdentity | undefined) {
    if (!value) {
      this._logout.identity = null;
    } else if (value instanceof Identity) {
      this._logout.identity = value.inner;
    } else {
      this._logout.identity = value;
    }
  }

  get session(): Session | undefined {
    const sess = this._logout.session;
    if (!sess) return undefined;
    return Session._fromLasso(sess);
  }

  set session(value: Session | LassoSession | undefined) {
    if (!value) {
      this._logout.session = null;
    } else if (value instanceof Session) {
      this._logout.session = value.inner;
    } else {
      this._logout.session = value;
    }
  }
}

/**
 * Identity class wrapper - delegates to lasso.js Identity
 */
export class Identity {
  private _identity: LassoIdentity;

  private constructor(identity: LassoIdentity) {
    this._identity = identity;
  }

  /**
   * Create Identity from lasso Identity (internal use)
   */
  static _fromLasso(identity: LassoIdentity): Identity {
    return new Identity(identity);
  }

  static fromDump(dump: string): Identity {
    const lasso = getLasso();
    return new Identity(lasso.Identity.fromDump(dump));
  }

  dump(): string | null {
    return this._identity.dump();
  }

  get isEmpty(): boolean {
    return this._identity.isEmpty;
  }

  /**
   * Get the underlying lasso Identity object
   */
  get inner(): LassoIdentity {
    return this._identity;
  }
}

/**
 * Session class wrapper - delegates to lasso.js Session
 */
export class Session {
  private _session: LassoSession;

  constructor() {
    const lasso = getLasso();
    this._session = new lasso.Session();
  }

  /**
   * Create Session from lasso Session (internal use)
   */
  static _fromLasso(session: LassoSession): Session {
    const wrapper = Object.create(Session.prototype);
    wrapper._session = session;
    return wrapper;
  }

  static fromDump(dump: string): Session {
    const lasso = getLasso();
    return Session._fromLasso(lasso.Session.fromDump(dump));
  }

  dump(): string | null {
    return this._session.dump();
  }

  get isDirty(): boolean {
    return this._session.isDirty;
  }

  /**
   * Get the underlying lasso Session object
   */
  get inner(): LassoSession {
    return this._session;
  }
}
