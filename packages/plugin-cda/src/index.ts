/**
 * Cross-Domain Authentication (CDA) Plugin
 *
 * Allows SSO between domains by passing a temporary CDA token
 * when redirecting to external applications.
 *
 * Perl reference: Lemonldap::NG::Portal::Plugins::CDA
 *
 * Configuration: cda = 1
 */

import type { PluginResult } from "@lemonldap-ng/portal";
import { BasePlugin, ok, PE_ERROR } from "@lemonldap-ng/plugin-common";
import crypto from "crypto";

// URL regex to match protocol://host/path
const URIRE = /^(https?):\/\/([^/]+)(\/.*)?$/i;

/**
 * Extended request interface for CDA
 */
interface CDARequest {
  llngSession?: {
    _session_id: string;
    _httpSession?: string;
    [key: string]: any;
  };
  llngSessionId?: string;
  llngUrldc?: string;
  body?: { url?: string };
  secure?: boolean;
}

/**
 * CDA Plugin - Cross-Domain Authentication
 *
 * Implements the endAuth and forAuthUser hooks to modify
 * the redirect URL when going to external domains.
 */
export class CDAPlugin extends BasePlugin {
  readonly name = "CDA";

  private cookieName!: string;
  private securedCookie!: number;
  private domain?: string;

  protected async onInit(): Promise<boolean> {
    this.cookieName = this.getConf("cookieName", "lemonldap");
    this.securedCookie = this.getConf("securedCookie", 0);
    this.domain = this.getConf("domain");

    this.info("CDA plugin initialized");
    return true;
  }

  /**
   * Check if URL is external (cookie won't be seen)
   */
  private urlIsExternal(portal: string, urldc: string): boolean {
    if (!urldc) return false;

    const match = urldc.match(URIRE);
    if (!match) return false;

    const host = match[2].toLowerCase();

    // If domain is set, check if host is within domain
    if (this.domain) {
      const domainWithoutDot = this.domain.replace(/^\./, "");

      // Exact domain match
      if (host === domainWithoutDot.toLowerCase()) {
        return false;
      }

      // Subdomain match
      if (host.endsWith(this.domain.toLowerCase())) {
        return false;
      }

      return true;
    }

    // No domain set: cookie only sent to portal host
    try {
      const portalUrl = new URL(portal);
      return host !== portalUrl.hostname.toLowerCase();
    } catch {
      return true;
    }
  }

  /**
   * Check if URL is trusted
   */
  private isTrustedUrl(urldc: string): boolean {
    // For now, trust all URLs that match our applications
    // TODO: Implement proper trust checking based on locationRules
    if (!urldc) return false;

    // Basic sanity check - must be http/https
    return URIRE.test(urldc);
  }

  /**
   * Generate a CDA session ID
   */
  private generateCDASessionId(): string {
    return crypto.randomBytes(16).toString("hex");
  }

  /**
   * Common logic for endAuth and forAuthUser hooks
   */
  async changeUrldc(req: CDARequest): Promise<PluginResult> {
    const urldc = req.llngUrldc || req.body?.url || "";
    const sessionId = req.llngSessionId || req.llngSession?._session_id;

    // Only process if we have a session and external URL
    if (!sessionId) {
      return ok();
    }

    const portal = this.getConf("portal", "/");

    if (!this.urlIsExternal(portal, urldc)) {
      this.debug(`URL ${urldc} is not external, skipping CDA`);
      return ok();
    }

    if (!this.isTrustedUrl(urldc)) {
      this.debug(`URL ${urldc} is not trusted, skipping CDA`);
      return ok();
    }

    const ssl = urldc.startsWith("https");
    this.debug("CDA request detected");

    // Determine which cookie value to use
    let cookieValue = sessionId;
    let cookieNameToUse = this.cookieName;

    // Handle double cookie mode (securedCookie >= 2)
    if (this.securedCookie >= 2 && !ssl) {
      const httpSession = req.llngSession?._httpSession;
      if (httpSession) {
        cookieValue = httpSession;
        cookieNameToUse = this.cookieName + "http";
      } else {
        this.error(
          "Session does not contain _httpSession field. " +
            "Portal must be accessed over HTTPS when using CDA with double cookie",
        );
        return {
          code: PE_ERROR,
          error: "CDA requires HTTPS with double cookie",
        };
      }
    }

    // Create CDA session info
    const cdaInfos = {
      _utime: Math.floor(Date.now() / 1000),
      cookie_value: cookieValue,
      cookie_name: cookieNameToUse,
    };

    // Store CDA session
    try {
      const cdaSessionId = this.generateCDASessionId();
      const sessionAcc = this.portal.getSessionAccessor();

      // Store CDA session with short TTL
      await sessionAcc.update({
        _session_id: `CDA_${cdaSessionId}`,
        _session_kind: "CDA",
        ...cdaInfos,
      });

      // Modify urldc to include CDA token
      const separator = urldc.includes("?") ? "&" : "?";
      req.llngUrldc = `${urldc}${separator}${this.cookieName}cda=${cdaSessionId}`;

      this.debug(`CDA redirection to ${req.llngUrldc}`);
    } catch (error) {
      this.error(`Unable to create CDA session: ${error}`);
      // Don't fail the auth, just skip CDA
    }

    return ok();
  }

  /**
   * Called at end of authentication process
   */
  async endAuth(req: CDARequest): Promise<PluginResult> {
    return this.changeUrldc(req);
  }

  /**
   * Called for already authenticated users
   */
  async forAuthUser(req: CDARequest): Promise<PluginResult> {
    return this.changeUrldc(req);
  }
}

export default CDAPlugin;
