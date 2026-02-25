import { Router, Response, Request } from "express";
import type { PortalRequest } from "../types";
import type { Portal } from "../portal";
import type { LLNG_Session } from "@lemonldap-ng/types";

/**
 * Check if request wants JSON response
 */
function wantsJson(req: Request): boolean {
  const accept = req.headers.accept || "";
  // JSON if explicitly requested and not also requesting HTML
  return accept.includes("application/json") && !accept.includes("text/html");
}

/**
 * Check if URL is protected (has locationRules)
 */
function isUrlProtected(url: string, conf: any): boolean {
  if (!url || !conf.locationRules) return true; // assume protected if no rules
  try {
    const urlObj = new URL(url);
    const host = urlObj.hostname;
    // Check if host has locationRules (exact match)
    if (conf.locationRules[host]) return true;
    // Check for wildcard matches (*.example.com matches foo.example.com)
    const hostParts = host.split(".");
    for (let i = 1; i < hostParts.length; i++) {
      const wildcardHost = "*." + hostParts.slice(i).join(".");
      if (conf.locationRules[wildcardHost]) return true;
    }
    return false;
  } catch {
    return true; // assume protected on parse error
  }
}

/**
 * Create portal routes
 */
export function createRoutes(portal: Portal): Router {
  const router = Router();
  const conf = portal.getConf();
  const logger = portal.getLogger();
  const cookieName = conf.cookieName || "lemonldap";

  // Add security headers middleware
  router.use((req, res, next) => {
    if (conf.strictTransportSecurityMax_Age) {
      res.setHeader("Strict-Transport-Security", `max-age=${conf.strictTransportSecurityMax_Age}`);
    }
    next();
  });

  /**
   * GET / - Show login form or menu
   */
  router.get("/", async (req: PortalRequest, res: Response) => {
    // Handle logout via query parameter (?logout)
    if ("logout" in req.query) {
      if (req.llngSessionId) {
        await portal.deleteSession(req.llngSessionId);
        logger.info(`Session ${req.llngSessionId} logged out via query`);
      }
      // Clear cookie by setting it to empty with past expiration
      res.setHeader("Set-Cookie", `${cookieName}=; Path=/; Domain=${conf.domain}; Max-Age=0`);
      if (wantsJson(req)) {
        return res.json({ result: 1 });
      }
      const html = portal.render("login", { FAVICON: conf.portalFavicon });
      return res.send(html);
    }

    // Already authenticated?
    if (req.llngSession) {
      // Set authenticated user header
      res.setHeader("Lm-Remote-User", String(req.llngSession.uid || req.llngSession._user || ""));

      // Check for URL redirect
      const urlParam = req.query.url as string | undefined;
      if (urlParam) {
        try {
          const decodedUrl = Buffer.from(urlParam, "base64").toString();
          // Only redirect if URL is protected (host is declared in locationRules)
          if (isUrlProtected(decodedUrl, conf)) {
            return res.redirect(302, decodedUrl);
          }
          // URL is not protected, show menu instead
        } catch {
          // Invalid base64, continue with menu
        }
      }

      if (wantsJson(req)) {
        return res.json({ result: 1, user: req.llngSession.uid || req.llngSession._user });
      }
      const html = portal.render("menu", {
        session: req.llngSession,
        URLDC: req.llngUrldc,
        HAS_PASSWORD_MODULE: portal.hasPasswordModule(),
        FAVICON: conf.portalFavicon,
      });
      return res.send(html);
    }

    // Check if URL parameter is for an unprotected URL
    const urlParam = req.query.url as string | undefined;
    if (urlParam) {
      try {
        const decodedUrl = Buffer.from(urlParam, "base64").toString();
        if (!isUrlProtected(decodedUrl, conf)) {
          // Unprotected URL - error 109
          if (wantsJson(req)) {
            return res.status(401).json({ result: 0, error: 109 });
          }
          const html = portal.render("login", {
            ERROR_CODE: 109,
            ERROR_MSG: "Unprotected URL",
            FAVICON: conf.portalFavicon,
          });
          return res.send(html);
        }
      } catch {
        // Invalid base64, continue with normal flow
      }
    }

    // Not authenticated - return 401 for JSON, login form for HTML
    if (wantsJson(req)) {
      return res.status(401).json({ result: 0, error: 9 });
    }

    // Show login form with error code 9 (first access)
    const html = portal.render("login", {
      URLDC: req.llngUrldc,
      ERROR_CODE: 9,
      ERROR_MSG: "Please authenticate",
      FAVICON: conf.portalFavicon,
    });
    res.send(html);
  });

  /**
   * POST / - Process login
   */
  router.post("/", async (req: PortalRequest, res: Response) => {
    // Already authenticated?
    if (req.llngSession) {
      // Redirect to urldc or show menu
      if (req.llngUrldc) {
        return res.redirect(req.llngUrldc);
      }
      if (wantsJson(req)) {
        return res.json({ result: 1, user: req.llngSession.uid || req.llngSession._user });
      }
      const html = portal.render("menu", {
        session: req.llngSession,
        HAS_PASSWORD_MODULE: portal.hasPasswordModule(),
      });
      return res.send(html);
    }

    // Check auth result
    if (!req.llngAuthResult?.success) {
      // Auth failed
      if (wantsJson(req)) {
        return res.status(401).json({ result: 0, error: req.llngAuthResult?.errorCode || 5 });
      }
      // Show login form with error (error code 5 = bad credentials)
      const html = portal.render("login", {
        AUTH_ERROR: req.llngAuthResult?.error || "Authentication failed",
        AUTH_ERROR_CODE: req.llngAuthResult?.errorCode || 5,
        LOGIN: req.llngCredentials?.user,
        URLDC: req.llngUrldc || req.body?.url,
        FAVICON: conf.portalFavicon,
      });
      return res.send(html);
    }

    // Auth succeeded, create session
    if (!req.llngUserData) {
      const html = portal.render("error", {
        error: "User data not found",
        errorCode: "NO_USER_DATA",
      });
      return res.status(500).send(html);
    }

    // Check if 2FA is required
    if (portal.has2FA()) {
      const twoFactorManager = portal.getTwoFactorManager();

      // Build a temporary session-like object to check 2FA
      const tempSession: LLNG_Session = {
        _session_id: "",
        _utime: Math.floor(Date.now() / 1000),
        _user: req.llngCredentials!.user,
        _2fDevices: req.llngUserData.attributes._2fDevices as string,
      };

      if (twoFactorManager.is2FARequired(tempSession)) {
        // Get available modules
        const availableModules = twoFactorManager
          .getAvailableModules(tempSession)
          .map((m) => m.prefix);

        if (availableModules.length > 0) {
          // Create pending 2FA session
          const sfToken = twoFactorManager.createPendingSession(
            req.llngCredentials!.user,
            req.llngUserData,
            req.llngCredentials!,
            availableModules,
            req.llngUrldc || req.body?.url,
          );

          logger.info(
            `2FA required for ${req.llngCredentials!.user}, redirecting`,
          );

          // Redirect to 2FA
          return res.redirect(`/2fa?token=${sfToken}`);
        }
      }
    }

    const sessionId = portal.generateSessionId();
    const userDBModule = portal.getUserDBModule();

    // Create session with user data
    const session = await portal.createSession(sessionId, {
      _user: req.llngCredentials!.user,
    });

    // Let userDB module set session info
    userDBModule.setSessionInfo(session, req.llngUserData);
    await portal.updateSession(session);

    logger.info(`Session created for ${session.uid || session._user}`);

    // Set session cookie
    const cookieOptions: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: "lax" | "strict" | "none";
      path: string;
      domain?: string;
      maxAge?: number;
    } = {
      httpOnly: conf.httpOnly !== false,
      secure: conf.securedCookie === 1 || req.secure,
      sameSite: "lax",
      path: "/",
    };

    if (conf.domain) {
      cookieOptions.domain = conf.domain;
    }

    if (conf.cookieExpiration && conf.cookieExpiration > 0) {
      cookieOptions.maxAge = conf.cookieExpiration * 1000;
    }

    res.cookie(cookieName, sessionId, cookieOptions);

    // Redirect to urldc or show menu
    const urldc = req.llngUrldc || req.body?.url;
    if (urldc && !wantsJson(req)) {
      return res.redirect(urldc);
    }

    if (wantsJson(req)) {
      return res.json({ result: 1, id: sessionId });
    }

    const html = portal.render("menu", {
      session,
      HAS_PASSWORD_MODULE: portal.hasPasswordModule(),
    });
    res.send(html);
  });

  /**
   * GET /logout - Logout and destroy session
   */
  router.get("/logout", async (req: PortalRequest, res: Response) => {
    if (req.llngSessionId) {
      await portal.deleteSession(req.llngSessionId);
      logger.info(`Session ${req.llngSessionId} logged out`);
    }

    // Clear cookie
    res.clearCookie(cookieName, {
      path: "/",
      domain: conf.domain,
    });

    if (wantsJson(req)) {
      return res.json({ result: 1 });
    }

    // Show login form
    const html = portal.render("login", {});
    res.send(html);
  });

  // Password change routes (only if password module is configured)
  if (portal.hasPasswordModule()) {
    /**
     * GET /password - Show password change form
     */
    router.get("/password", async (req: PortalRequest, res: Response) => {
      // Must be authenticated
      if (!req.llngSession) {
        return res.redirect(conf.portal || "/");
      }

      const html = portal.render("password", {
        session: req.llngSession,
      });
      res.send(html);
    });

    /**
     * POST /password - Process password change
     */
    router.post("/password", async (req: PortalRequest, res: Response) => {
      // Must be authenticated
      if (!req.llngSession) {
        return res.redirect(conf.portal || "/");
      }

      const { oldPassword, newPassword, confirmPassword } = req.body;

      // Validate form data
      if (!newPassword) {
        const html = portal.render("password", {
          session: req.llngSession,
          PASSWORD_ERROR: "New password is required",
          PASSWORD_ERROR_CODE: "PE_PASSWORD_MISSING",
        });
        return res.send(html);
      }

      if (newPassword !== confirmPassword) {
        const html = portal.render("password", {
          session: req.llngSession,
          PASSWORD_ERROR: "Passwords do not match",
          PASSWORD_ERROR_CODE: "PE_PASSWORD_MISMATCH",
        });
        return res.send(html);
      }

      // Get user DN from session
      const userDn = req.llngSession._dn as string | undefined;
      if (!userDn) {
        logger.error("Password change: No DN in session");
        const html = portal.render("password", {
          session: req.llngSession,
          PASSWORD_ERROR: "Unable to change password: user DN not found",
          PASSWORD_ERROR_CODE: "PE_ERROR",
        });
        return res.send(html);
      }

      // Check if we're in password reset mode (ppolicy mustChange)
      const passwordReset = req.llngSession._pwdMustChange === true;

      // Call password module
      const passwordModule = portal.getPasswordModule()!;
      const result = await passwordModule.modifyPassword(userDn, newPassword, {
        oldPassword,
        passwordReset,
      });

      if (!result.success) {
        logger.warn(
          `Password change failed for ${userDn}: ${result.error} (${result.errorCode})`,
        );
        const html = portal.render("password", {
          session: req.llngSession,
          PASSWORD_ERROR: result.error || "Password change failed",
          PASSWORD_ERROR_CODE: result.errorCode,
        });
        return res.send(html);
      }

      // Password changed successfully
      logger.info(`Password changed for ${userDn}`);

      // Clear mustChange flag in session
      if (req.llngSession._pwdMustChange) {
        delete req.llngSession._pwdMustChange;
        await portal.updateSession(req.llngSession);
      }

      // Show success message
      const html = portal.render("password", {
        session: req.llngSession,
        PASSWORD_SUCCESS: true,
        PASSWORD_MESSAGE: "Password changed successfully",
      });
      res.send(html);
    });
  }

  return router;
}

export { create2FARoutes } from "./2fa";

export default createRoutes;
