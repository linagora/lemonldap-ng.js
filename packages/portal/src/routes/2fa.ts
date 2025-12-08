/**
 * 2FA Routes for Portal
 *
 * Handles second factor authentication challenge and verification
 *
 * @packageDocumentation
 */

import { Router, Response } from "express";
import type { PortalRequest } from "../types";
import type { Portal } from "../portal";
import type { TwoFactorSessionInfo } from "@lemonldap-ng/2fa-common";

/**
 * Create 2FA routes
 */
export function create2FARoutes(portal: Portal): Router {
  const router = Router();
  const conf = portal.getConf();
  const logger = portal.getLogger();
  const twoFactorManager = portal.getTwoFactorManager();
  const cookieName = conf.cookieName || "lemonldap";

  /**
   * GET /2fa - Show 2FA challenge selection or redirect
   */
  router.get("/2fa", async (req: PortalRequest, res: Response) => {
    // Get pending token from query or session
    const sfToken = (req.query.token as string) || req.cookies?.sfToken;

    if (!sfToken) {
      logger.warn("2FA: No token provided");
      return res.redirect(conf.portal || "/");
    }

    const pending = twoFactorManager.getPendingSession(sfToken);
    if (!pending) {
      logger.warn("2FA: Invalid or expired token");
      return res.redirect(conf.portal || "/");
    }

    // Get available modules
    const modules = pending.availableModules;

    if (modules.length === 0) {
      logger.error("2FA: No modules available");
      return res.redirect(conf.portal || "/");
    }

    // If only one module, redirect to it
    if (modules.length === 1) {
      return res.redirect(`/2fa/${modules[0]}?token=${sfToken}`);
    }

    // Show module selection
    const moduleData = modules.map((prefix) => {
      const mod = twoFactorManager.getModule(prefix);
      return {
        prefix,
        label: mod?.label || prefix,
        logo: mod?.logo,
      };
    });

    const html = portal.render("2fachoice", {
      modules: moduleData,
      token: sfToken,
    });
    res.send(html);
  });

  /**
   * GET /2fa/:type - Show specific 2FA challenge
   */
  router.get("/2fa/:type", async (req: PortalRequest, res: Response) => {
    const type = req.params.type;
    const sfToken = (req.query.token as string) || req.cookies?.sfToken;

    if (!sfToken) {
      logger.warn(`2FA ${type}: No token provided`);
      return res.redirect(conf.portal || "/");
    }

    const pending = twoFactorManager.getPendingSession(sfToken);
    if (!pending) {
      logger.warn(`2FA ${type}: Invalid or expired token`);
      return res.redirect(conf.portal || "/");
    }

    const module = twoFactorManager.getModule(type);
    if (!module) {
      logger.warn(`2FA ${type}: Unknown module`);
      return res.redirect("/2fa?token=" + sfToken);
    }

    // Create session info for the module
    const sessionInfo: TwoFactorSessionInfo = {
      sessionId: sfToken,
      user: pending.user,
      _2fDevices: pending.userData?.attributes?._2fDevices as string,
    };

    try {
      const challenge = await twoFactorManager.generateChallenge(
        type,
        req as any,
        sessionInfo,
        sfToken,
      );

      // Set sfToken cookie for form submission
      res.cookie("sfToken", sfToken, {
        httpOnly: true,
        secure: req.secure,
        sameSite: "lax",
        maxAge: 300000, // 5 minutes
      });

      const html = portal.render(challenge.template || `${type}2fcheck`, {
        token: sfToken,
        challenge,
        prefix: type,
        logo: module.logo,
        label: module.label,
        ...challenge.data,
      });
      res.send(html);
    } catch (e) {
      logger.error(`2FA ${type}: Challenge error: ${e}`);
      const html = portal.render("error", {
        error: "2FA challenge failed",
        errorCode: "PE_2FA_ERROR",
      });
      res.status(500).send(html);
    }
  });

  /**
   * POST /2fa/:type - Verify 2FA response
   */
  router.post("/2fa/:type", async (req: PortalRequest, res: Response) => {
    const type = req.params.type;
    const sfToken = req.body?.token || req.cookies?.sfToken;

    if (!sfToken) {
      logger.warn(`2FA ${type} verify: No token provided`);
      return res.redirect(conf.portal || "/");
    }

    const pending = twoFactorManager.getPendingSession(sfToken);
    if (!pending) {
      logger.warn(`2FA ${type} verify: Invalid or expired token`);
      const html = portal.render("error", {
        error: "2FA session expired",
        errorCode: "PE_TOKENEXPIRED",
      });
      return res.status(401).send(html);
    }

    const module = twoFactorManager.getModule(type);
    if (!module) {
      logger.warn(`2FA ${type} verify: Unknown module`);
      return res.redirect("/2fa?token=" + sfToken);
    }

    // Create session info
    const sessionInfo: TwoFactorSessionInfo = {
      sessionId: sfToken,
      user: pending.user,
      _2fDevices: pending.userData?.attributes?._2fDevices as string,
    };

    try {
      const result = await twoFactorManager.verify(
        type,
        req as any,
        sessionInfo,
      );

      if (!result.success) {
        logger.notice(
          `2FA ${type} verify: Failed for ${pending.user}: ${result.error}`,
        );

        // Re-show challenge with error
        const challenge = await twoFactorManager.generateChallenge(
          type,
          req as any,
          sessionInfo,
          sfToken,
        );

        const html = portal.render(challenge.template || `${type}2fcheck`, {
          token: sfToken,
          challenge,
          prefix: type,
          logo: module.logo,
          label: module.label,
          SF_ERROR: result.error || "Invalid code",
          SF_ERROR_CODE: result.code,
          ...challenge.data,
        });
        return res.send(html);
      }

      // 2FA succeeded - create session
      logger.info(`2FA ${type} verify: Success for ${pending.user}`);

      // Delete pending session
      twoFactorManager.deletePendingSession(sfToken);

      // Clear sfToken cookie
      res.clearCookie("sfToken");

      // Create actual session
      const sessionId = portal.generateSessionId();
      const userDBModule = portal.getUserDBModule();

      const session = await portal.createSession(sessionId, {
        _user: pending.user,
      });

      // Set session info from user data
      userDBModule.setSessionInfo(session, pending.userData);

      // Update auth level if module specifies one
      if (module.authnLevel) {
        session.authenticationLevel = module.authnLevel;
      }

      await portal.updateSession(session);

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
        cookieOptions.domain = conf.domain as string;
      }

      if (conf.cookieExpiration && (conf.cookieExpiration as number) > 0) {
        cookieOptions.maxAge = (conf.cookieExpiration as number) * 1000;
      }

      res.cookie(cookieName, sessionId, cookieOptions);

      // Redirect to urldc or show menu
      if (pending.urldc) {
        return res.redirect(pending.urldc);
      }

      const html = portal.render("menu", {
        session,
        HAS_PASSWORD_MODULE: portal.hasPasswordModule(),
      });
      res.send(html);
    } catch (e) {
      logger.error(`2FA ${type} verify: Error: ${e}`);
      const html = portal.render("error", {
        error: "2FA verification failed",
        errorCode: "PE_2FA_ERROR",
      });
      res.status(500).send(html);
    }
  });

  return router;
}

export default create2FARoutes;
