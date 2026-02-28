import type { PluginRegistration } from "./types";

/**
 * Static plugin registry
 *
 * This is the JavaScript equivalent of Perl's @pList in Plugins.pm
 * Plugins are listed in load order (priority overrides order).
 *
 * Note: In Perl, plugins are part of the same distribution.
 * In JS, plugins are separate npm packages following the naming convention:
 * @lemonldap-ng/plugin-{name}
 */
export const pluginRegistry: PluginRegistration[] = [
  // Password reset
  {
    configKeys: "portalDisplayResetPassword",
    packageName: "@lemonldap-ng/plugin-mail-password-reset",
  },

  // Certificate reset by mail
  {
    configKeys: "portalDisplayCertificateResetByMail",
    packageName: "@lemonldap-ng/plugin-certificate-reset",
  },

  // Cross-Domain Authentication
  {
    configKeys: "cda",
    packageName: "@lemonldap-ng/plugin-cda",
  },

  // Notifications
  {
    configKeys: "notification",
    packageName: "@lemonldap-ng/plugin-notifications",
  },

  // Public notifications (depends on notifications)
  {
    configKeys: "publicNotifications",
    packageName: "@lemonldap-ng/plugin-public-notifications",
  },

  // Remember auth choice
  {
    configKeys: "rememberAuthChoiceRule",
    packageName: "@lemonldap-ng/plugin-remember-auth-choice",
  },

  // Stay connected
  {
    configKeys: "stayConnected",
    packageName: "@lemonldap-ng/plugin-stay-connected",
  },

  // Login history
  {
    configKeys: "portalCheckLogins",
    packageName: "@lemonldap-ng/plugin-history",
  },

  // Brute force protection
  {
    configKeys: "bruteForceProtection",
    packageName: "@lemonldap-ng/plugin-brute-force",
  },

  // Grant session rules
  {
    configKeys: "grantSessionRules",
    packageName: "@lemonldap-ng/plugin-grant-session",
  },

  // Session upgrade
  {
    configKeys: "upgradeSession",
    packageName: "@lemonldap-ng/plugin-upgrade",
  },

  // Auto sign-in
  {
    configKeys: "autoSigninRules",
    packageName: "@lemonldap-ng/plugin-auto-signin",
  },

  // Check state
  {
    configKeys: "checkState",
    packageName: "@lemonldap-ng/plugin-check-state",
  },

  // Web cron
  {
    configKeys: "webCronSecret",
    packageName: "@lemonldap-ng/plugin-web-cron",
  },

  // Force authentication
  {
    configKeys: "portalForceAuthn",
    packageName: "@lemonldap-ng/plugin-force-authn",
  },

  // Check user
  {
    configKeys: "checkUser",
    packageName: "@lemonldap-ng/plugin-check-user",
  },

  // Check DevOps
  {
    configKeys: "checkDevOps",
    packageName: "@lemonldap-ng/plugin-check-devops",
  },

  // Context switching
  {
    configKeys: "contextSwitchingRule",
    packageName: "@lemonldap-ng/plugin-context-switching",
  },

  // Decrypt value
  {
    configKeys: "decryptValueRule",
    packageName: "@lemonldap-ng/plugin-decrypt-value",
  },

  // Find user
  {
    configKeys: "findUser",
    packageName: "@lemonldap-ng/plugin-find-user",
  },

  // New location warning
  {
    configKeys: "newLocationWarning",
    packageName: "@lemonldap-ng/plugin-new-location-warning",
  },

  // Password policy
  {
    configKeys: "passwordPolicyActivation",
    packageName: "@lemonldap-ng/plugin-password-policy",
  },

  // Check HIBP (Have I Been Pwned)
  {
    configKeys: "checkHIBP",
    packageName: "@lemonldap-ng/plugin-check-hibp",
  },

  // Check entropy
  {
    configKeys: "checkEntropy",
    packageName: "@lemonldap-ng/plugin-check-entropy",
  },

  // Initialize password reset
  {
    configKeys: "initializePasswordReset",
    packageName: "@lemonldap-ng/plugin-initialize-password-reset",
  },

  // OIDC offline tokens
  {
    configKeys: "oidcOfflineTokens",
    packageName: "@lemonldap-ng/plugin-oidc-offline-tokens",
  },

  // Adaptive authentication level
  {
    configKeys: "adaptativeAuthenticationLevelRules",
    packageName: "@lemonldap-ng/plugin-adaptive-auth-level",
  },

  // Refresh sessions
  {
    configKeys: "refreshSessions",
    packageName: "@lemonldap-ng/plugin-refresh",
  },

  // External menu
  {
    configKeys: "externalMenu",
    packageName: "@lemonldap-ng/plugin-external-menu",
  },

  // CrowdSec agent
  {
    configKeys: "crowdsecAgent",
    packageName: "@lemonldap-ng/plugin-crowdsec-agent",
  },

  // CrowdSec
  {
    configKeys: "crowdsec",
    packageName: "@lemonldap-ng/plugin-crowdsec",
  },

  // Location detect
  {
    configKeys: "locationDetect",
    packageName: "@lemonldap-ng/plugin-location-detect",
  },

  // Global logout
  {
    configKeys: "globalLogoutRule",
    packageName: "@lemonldap-ng/plugin-global-logout",
  },

  // SAML Federation
  {
    configKeys: "samlFederationFiles",
    packageName: "@lemonldap-ng/plugin-saml-federation",
  },

  // Admin logout
  {
    configKeys: "adminLogoutServerSecret",
    packageName: "@lemonldap-ng/plugin-admin-logout",
  },

  // OIDC Native SSO (wildcard path)
  {
    configKeys: "oidcNativeSso",
    packageName: "@lemonldap-ng/plugin-oidc-native-sso",
    wildcardPath: {
      type: "or",
      path: "oidcRPMetaDataOptions/*/oidcRPMetaDataOptionsAllowNativeSso",
    },
  },

  // OIDC PKCE requirement (wildcard path)
  {
    configKeys: "oidcPkce",
    packageName: "@lemonldap-ng/plugin-auth-oidc-pkce",
    wildcardPath: {
      type: "or",
      path: "oidcOPMetaDataOptions/*/oidcOPMetaDataOptionsRequirePkce",
    },
  },

  // OIDC Internal token exchange (wildcard path)
  {
    configKeys: "oidcTokenExchange",
    packageName: "@lemonldap-ng/plugin-oidc-token-exchange",
    wildcardPath: {
      type: "or",
      path: "oidcRPMetaDataOptions/*/oidcRPMetaDataOptionsTokenXAuthorizedRP",
    },
  },

  // Single session (compound condition - any of these enables it)
  {
    configKeys: "singleSession",
    packageName: "@lemonldap-ng/plugin-single-session",
    compoundCondition: {
      type: "or",
      keys: ["singleSession", "singleIP", "singleUserByIP", "notifyOther"],
    },
  },

  // Impersonation - MUST BE LAST (highest priority)
  {
    configKeys: "impersonationRule",
    packageName: "@lemonldap-ng/plugin-impersonation",
    priority: 1000,
  },
];

/**
 * Get plugins sorted by priority
 * Lower priority loads first, higher priority loads last
 */
export function getSortedRegistry(): PluginRegistration[] {
  return [...pluginRegistry].sort((a, b) => {
    const priorityA = a.priority ?? 0;
    const priorityB = b.priority ?? 0;
    return priorityA - priorityB;
  });
}

/**
 * Add a custom plugin to the registry
 * Use this to register plugins not in the default list
 */
export function registerPlugin(registration: PluginRegistration): void {
  pluginRegistry.push(registration);
}
