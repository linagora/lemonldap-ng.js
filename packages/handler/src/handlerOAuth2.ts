/**
 * OAuth2/OIDC Handler for LemonLDAP::NG
 * Port of Lemonldap::NG::Handler::Lib::OAuth2
 *
 * A Bearer access token is an *opaque credential*: the token itself (or the
 * `jti` claim of its JWT serialization) is the identifier of an access token
 * session created by the Portal. This handler therefore:
 *
 *  1. resolves the access token session in the OIDC session storage,
 *  2. follows it to the user session (or offline session) it was issued for,
 *  3. exposes the token attributes (scope, client, audiences, grant type) as
 *     session attributes so that rules and headers can use them.
 *
 * Nothing but the session identifier is ever read from the token: the trust
 * anchor is the session store, not the token payload.
 */

import express from "express";
import http from "http";
import LemonldapNGHandler from "./handlerMain";
import Session from "@lemonldap-ng/session";
import { getAccessTokenSessionId } from "@lemonldap-ng/jwt";
import { LLNG_Session } from "@lemonldap-ng/types";

/* Prefix used by fetchId() to mark offline session ids */
const OFFLINE_PREFIX = "O-";

/**
 * Shape of a session identifier.
 *
 * The value carried by a Bearer token is attacker controlled and is handed
 * over as-is to the session storage, where some backends interpolate it into
 * a LDAP DN (@lemonldap-ng/session-ldap) or into an URL
 * (@lemonldap-ng/session-rest). Only accept what the Portal may have
 * generated, so that a crafted `jti` can not escape the lookup.
 */
const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

/* Session attributes forged from the access token session */
type TokenAttributes = { [k: string]: any };

/* Result of an access token session lookup */
type OIDCLookup =
  | { status: "ok"; data: LLNG_Session }
  | { status: "notFound" }
  | { status: "invalid" };

/**
 * Per-request state, shared between fetchId(), retrieveSession() and
 * goToPortal(). It is stored in a WeakMap keyed by both the request and the
 * response objects, so that concurrent requests never share it.
 */
type OAuth2State = {
  /* true as soon as the request has been authenticated by a Bearer token */
  viaToken?: boolean;
  error?: string;
  attrs?: TokenAttributes;
};

class LemonldapNGHandlerOAuth2 extends LemonldapNGHandler {
  private oidcSessionAcc: Session | undefined;
  private ownOidcSessionAcc: boolean = false;
  private state: WeakMap<object, OAuth2State> = new WeakMap();

  /**
   * Override reload() - and not init() - to set up the OIDC session storage.
   *
   * init() runs once, while reload() runs again on every configuration change
   * announced by the message broker, and it rebuilds the main session
   * accessor. The OIDC accessor must follow: else the handler would keep
   * querying the previous storage (with its own cache), localUnlog() would
   * only purge the new one, and a modified oidcStorage would never be applied.
   */
  async reload(): Promise<boolean> {
    const res = await super.reload();
    await this.initOidcSessionStorage();
    return res;
  }

  /**
   * (Re)build the accessor used for access token and offline sessions
   *
   * The new accessor is only installed once it is known to be usable: a
   * reload announcing a broken oidcStorage must leave the handler running on
   * its previous storage rather than answering 401 to every token, and must
   * not leak the accessor it failed to replace (its node-persist timers would
   * keep the process alive).
   */
  private async initOidcSessionStorage(): Promise<void> {
    const storageModule = this.tsv.oidcStorageModule;
    if (!storageModule) {
      // istanbul ignore next
      throw new Error("OAuth2 handler requires a session storage");
    }

    let candidate: Session;
    let owned: boolean;

    // Reuse the main accessor when both storages are identical, as it is the
    // case when no dedicated oidcStorage is configured
    if (
      storageModule === this.tsv.sessionStorageModule &&
      JSON.stringify(this.tsv.oidcStorageOptions || {}) ===
        JSON.stringify(this.tsv.sessionStorageOptions || {})
    ) {
      this.userLogger.debug("OAuth2 handler shares the main session storage");
      candidate = this.sessionAcc;
      owned = false;
    } else {
      try {
        candidate = new Session({
          storageModule,
          storageModuleOptions: this.tsv.oidcStorageOptions || {},
        });
        await candidate.ready;
      } catch (e) {
        throw new Error(`Unable to load OIDC session module: ${e}`, {
          cause: e,
        });
      }
      owned = true;
      this.userLogger.debug("OAuth2 OIDC session storage initialized");
    }

    // Accessor built by a previous reload(), to be closed once replaced
    const previous = this.ownOidcSessionAcc ? this.oidcSessionAcc : undefined;
    this.oidcSessionAcc = candidate;
    this.ownOidcSessionAcc = owned;

    if (previous && previous !== candidate) await previous.close();
  }

  /**
   * Override localUnlog to purge the OIDC caches too
   *
   * When the Portal revokes an access token, it broadcasts an unlog/delSession
   * message holding the id of the deleted session. With a dedicated
   * oidcStorage, that session lives in the OIDC accessor, whose caches
   * Main::localUnlog() does not know about: the revoked token would keep
   * authenticating until the cache entry expires.
   * @param sessionId - Session ID to clear (uses last cached if not provided)
   */
  async localUnlog(sessionId?: string): Promise<void> {
    // super.localUnlog() resets lastSessionId, read it first
    const id = sessionId || this.lastSessionId;
    await super.localUnlog(sessionId);
    // In the shared storage case both accessors are the same object, which
    // super.localUnlog() has already purged
    if (id && this.ownOidcSessionAcc && this.oidcSessionAcc) {
      await this.oidcSessionAcc.clearAllCaches(id);
    }
  }

  /**
   * Override run to bind the per-request state to both req and res: fetchId()
   * and retrieveSession() only see the request, goToPortal() only sees the
   * response.
   */
  run(
    req: express.Request | http.IncomingMessage,
    res: http.ServerResponse,
    next: Function,
  ) {
    const state: OAuth2State = {};
    this.state.set(req, state);
    this.state.set(res, state);
    return super.run(req, res, next);
  }

  /**
   * Override fetchId to resolve an OAuth2 Bearer token into a session id
   *
   * Contrary to the cookie case, the value carried by the request is *not* the
   * user session id: it identifies an access token session, which in turn
   * references the user session (or an offline session).
   * @param req - HTTP request
   */
  async fetchId(req: express.Request | http.IncomingMessage): Promise<string> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !/^bearer\s/i.test(authHeader)) {
      // Fall back to cookie-based authentication
      return super.fetchId(req);
    }

    const accessToken = authHeader.replace(/^bearer\s+/i, "").trim();

    // An empty Bearer token carries no credential, but the request may still
    // hold a valid cookie: the Perl handler reaches Main::fetchId here
    if (!accessToken) {
      this.userLogger.info("OAuth2: empty Bearer token");
      return this.fallbackToCookie(req);
    }

    // The token is either the access token session id, or a JWT whose `jti`
    // claim holds it
    const accessTokenId = getAccessTokenSessionId(accessToken);
    if (!accessTokenId) {
      return this.invalidToken(req, "No session id found in access token");
    }

    // The token is not signed, and even a signed one is not trusted here: the
    // id is about to be given to the session storage, so refuse anything that
    // does not look like a session id
    if (!this.isSessionId(accessTokenId)) {
      return this.invalidToken(req, "Malformed access token session id");
    }

    const lookup = await this.getOIDCInfos(accessTokenId);

    // An expired or corrupted access token session is a hard failure
    if (lookup.status === "invalid") {
      return this.invalidToken(req, "Access token session is not usable");
    }

    // An unknown access token is not necessarily an attack: the request may
    // also carry a valid cookie. Behave as the Perl handler and fall back.
    if (lookup.status === "notFound") {
      this.userLogger.info(`Unknown access token session ${accessTokenId}`);
      return this.fallbackToCookie(req);
    }

    const infos = lookup.data;

    // Scope, client and audiences, to be exposed as session attributes. They
    // are only published once the token is known to grant a session: a token
    // that ends up on the cookie fallback below must not lend its scope to
    // the session the cookie points to. This diverges from the Perl handler,
    // which sets $req->data->{_scope} before falling back and therefore lets
    // a bare client credentials token satisfy a $_scope based rule.
    const attrs = infos.rp
      ? this.tokenAttributes(accessToken, infos)
      : undefined;

    // Token tied to a regular session
    if (infos.user_session_id) {
      if (!this.isSessionId(infos.user_session_id)) {
        return this.invalidToken(
          req,
          `Malformed user_session_id in access token session ${accessTokenId}`,
        );
      }
      const state = this.stateFor(req);
      state.viaToken = true;
      state.attrs = attrs;
      this.userLogger.debug(
        `OAuth2: get user session ${infos.user_session_id}`,
      );
      return <string>infos.user_session_id;
    }

    // Token tied to an offline session
    if (infos.offline_session_id) {
      if (!this.isSessionId(infos.offline_session_id)) {
        return this.invalidToken(
          req,
          `Malformed offline_session_id in access token session ${accessTokenId}`,
        );
      }
      const state = this.stateFor(req);
      state.viaToken = true;
      state.attrs = attrs;
      this.userLogger.debug(
        `OAuth2: get offline session ${infos.offline_session_id}`,
      );
      return `${OFFLINE_PREFIX}${infos.offline_session_id}`;
    }

    this.userLogger.warn(
      `Access token session ${accessTokenId} references no session`,
    );
    return this.fallbackToCookie(req);
  }

  /**
   * Override retrieveSession to handle offline sessions and to expose the
   * access token attributes to rules and headers
   * @param id - Session ID, prefixed by "O-" for offline sessions
   * @param req - HTTP request, when available
   */
  retrieveSession(
    id: string,
    req?: express.Request | http.IncomingMessage,
  ): Promise<LLNG_Session> {
    const attrs = req ? this.state.get(req)?.attrs : undefined;

    if (!id.startsWith(OFFLINE_PREFIX)) {
      return super.retrieveSession(id, req).then(
        (session) => this.withTokenAttributes(session, attrs),
        (e) => {
          if (req && this.state.get(req)?.viaToken) {
            this.stateFor(req).error = "invalid_token";
          }
          throw e;
        },
      );
    }

    // Offline sessions live in the OIDC storage
    const offlineId = id.substring(OFFLINE_PREFIX.length);
    return this.getOIDCInfos(offlineId).then(
      (lookup) => {
        if (lookup.status !== "ok") {
          if (req) this.stateFor(req).error = "invalid_token";
          throw `Offline session ${offlineId} can not be retrieved`;
        }
        return this.withTokenAttributes(lookup.data, attrs);
      },
      // istanbul ignore next
      (e) => {
        if (req) this.stateFor(req).error = "invalid_token";
        throw e;
      },
    );
  }

  /**
   * Hide the access token from the protected application
   * @param req - HTTP request
   */
  hideCookie(req: express.Request | http.IncomingMessage): void {
    if (req.headers.authorization) {
      this.userLogger.debug("OAuth2: removing Authorization header");
      delete req.headers.authorization;
    }
    super.hideCookie(req);
  }

  /**
   * A resource server never redirects: answer with a 401 and the challenge
   * described in RFC 6750 section 3
   * @param res - HTTP response
   * @param _uri - Original URI (unused)
   * @param _args - Additional arguments (unused)
   */
  goToPortal(res: http.ServerResponse, _uri: string, _args: string = ""): void {
    const error = this.state.get(res)?.error;
    res.setHeader(
      "WWW-Authenticate",
      "Bearer" + (error ? ` error="${error}"` : ""),
    );

    // res.status is defined when running under express. If not we are running
    // as FastCGI server
    // @ts-ignore: res.status may exist
    if (res.status) {
      // @ts-ignore: res.status may exist
      res.status(401).send("Unauthorized");
    } else {
      res.writeHead(401, "Unauthorized");
    }
  }

  /**
   * Close the dedicated OIDC session storage, if any
   */
  async stopEventLoop(): Promise<void> {
    await super.stopEventLoop();
    if (this.ownOidcSessionAcc && this.oidcSessionAcc) {
      await this.oidcSessionAcc.close();
      this.userLogger.debug("OIDC session storage closed");
    }
  }

  /**
   * Get a session from the OIDC storage and check that it is not expired
   *
   * Note: the session backends do not tell an unknown session apart from an
   * unreachable storage, so both end up as "notFound" here, exactly as in the
   * Perl handler and as in the cookie path of Handler::Main. A storage outage
   * is therefore reported to the client as an invalid token. Fixing this
   * requires a "not found" signal in every @lemonldap-ng/session-* backend.
   * @param id - Access token, offline or OIDC session id
   */
  private getOIDCInfos(id: string): Promise<OIDCLookup> {
    if (this.oidcSessionAcc === undefined) {
      // istanbul ignore next
      return Promise.resolve<OIDCLookup>({ status: "invalid" });
    }
    return this.oidcSessionAcc.get(id).then(
      (data: LLNG_Session) => {
        // A non numeric _utime would turn the comparison below into
        // `NaN > timeout`, i.e. false, and grant an unbounded lifetime
        const utime = Number(data._utime);
        if (!data._utime || !Number.isFinite(utime)) {
          this.userLogger.error(`_utime missing from OIDC session ${id}`);
          return <OIDCLookup>{ status: "invalid" };
        }
        const now = (Date.now() / 1000) | 0;
        if (now - utime > this.tsv.timeout) {
          this.userLogger.info(`OIDC session ${id} expired`);
          return <OIDCLookup>{ status: "invalid" };
        }
        this.userLogger.debug(`Get OIDC session ${id}`);
        return <OIDCLookup>{ status: "ok", data };
      },
      (e: string) => {
        this.userLogger.info(`OIDC session ${id} can not be retrieved: ${e}`);
        return <OIDCLookup>{ status: "notFound" };
      },
    );
  }

  /**
   * Collect the access token session fields exposed to rules and headers
   * @param accessToken - Bearer token, as received
   * @param infos - Access token session
   */
  private tokenAttributes(
    accessToken: string,
    infos: LLNG_Session,
  ): TokenAttributes {
    const attrs: TokenAttributes = {
      _accessToken: accessToken,
      _clientConfKey: infos.rp,
    };
    if (infos.scope !== undefined) attrs._scope = infos.scope;
    if (infos.grant_type !== undefined) {
      attrs._oidc_grant_type = infos.grant_type;
    }
    if (infos.aud !== undefined) attrs._audiences = infos.aud;
    const clientId = this.tsv.oauth2Options?.[<string>infos.rp]?.clientId;
    if (clientId) attrs._clientId = clientId;
    return attrs;
  }

  /**
   * Build a copy of the session enriched with the access token attributes.
   * A copy is mandatory: the session object may be shared with the session
   * caches.
   */
  private withTokenAttributes(
    session: LLNG_Session,
    attrs: TokenAttributes | undefined,
  ): LLNG_Session {
    return attrs ? <LLNG_Session>{ ...session, ...attrs } : session;
  }

  /**
   * Check that a value may be handed over to the session storage
   *
   * Applied both to the id carried by the token and to the ids read from the
   * access token session: the latter are written by the Portal, but they end
   * up in a LDAP DN or in an URL just the same.
   * @param id - Candidate session id
   */
  private isSessionId(id: unknown): id is string {
    return typeof id === "string" && SESSION_ID_RE.test(id);
  }

  /**
   * Get (or create) the state attached to a request or a response
   */
  private stateFor(o: object): OAuth2State {
    let state = this.state.get(o);
    if (!state) {
      state = {};
      this.state.set(o, state);
    }
    return state;
  }

  /**
   * Reject the request with an "invalid_token" OAuth2 error
   */
  private invalidToken(
    req: express.Request | http.IncomingMessage,
    msg: string,
  ): string {
    this.userLogger.warn(`OAuth2: ${msg}`);
    this.stateFor(req).error = "invalid_token";
    return "";
  }

  /**
   * Use the LLNG cookie when the Bearer token can not be resolved
   */
  private async fallbackToCookie(
    req: express.Request | http.IncomingMessage,
  ): Promise<string> {
    const id = await super.fetchId(req);
    if (id === "") this.stateFor(req).error = "invalid_token";
    return id;
  }
}

export default LemonldapNGHandlerOAuth2;
