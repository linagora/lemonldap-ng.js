/**
 * @lemonldap-ng/issuer-saml
 *
 * SAML IdP (Issuer) for LemonLDAP::NG
 *
 * @packageDocumentation
 */

// Export main class
export { SAMLIssuer } from "./issuer";

// Export router
export {
  createSAMLIssuerRouter,
  type SAMLRequest,
  type SAMLRateLimitConfig,
} from "./router";

// Export types
export * from "./types";
