import { describe, it, expect } from "vitest";
import { checkConf, parseConfigCondition, shouldEnablePlugin } from "./config-checker";

describe("config-checker", () => {
  describe("checkConf", () => {
    it("should return true for simple truthy value", () => {
      const conf = { cda: true };
      expect(checkConf(conf, "cda")).toBe(true);
    });

    it("should return false for simple falsy value", () => {
      const conf = { cda: false };
      expect(checkConf(conf, "cda")).toBe(false);
    });

    it("should return false for missing key", () => {
      const conf = {};
      expect(checkConf(conf, "cda")).toBe(false);
    });

    it("should handle nested paths", () => {
      const conf = { auth: { methods: { openid: true } } };
      expect(checkConf(conf, "auth/methods/openid")).toBe(true);
    });

    it("should return false for missing nested key", () => {
      const conf = { auth: { methods: {} } };
      expect(checkConf(conf, "auth/methods/openid")).toBe(false);
    });

    it("should handle wildcard paths with OR logic", () => {
      const conf = {
        oidcRPMetaDataOptions: {
          app1: { oidcRPMetaDataOptionsAllowNativeSso: false },
          app2: { oidcRPMetaDataOptionsAllowNativeSso: true },
          app3: { oidcRPMetaDataOptionsAllowNativeSso: false },
        },
      };
      expect(
        checkConf(conf, "oidcRPMetaDataOptions/*/oidcRPMetaDataOptionsAllowNativeSso", "or")
      ).toBe(true);
    });

    it("should return false when no wildcard matches", () => {
      const conf = {
        oidcRPMetaDataOptions: {
          app1: { oidcRPMetaDataOptionsAllowNativeSso: false },
          app2: { oidcRPMetaDataOptionsAllowNativeSso: false },
        },
      };
      expect(
        checkConf(conf, "oidcRPMetaDataOptions/*/oidcRPMetaDataOptionsAllowNativeSso", "or")
      ).toBe(false);
    });

    it("should handle AND logic for wildcards", () => {
      const conf = {
        apps: {
          app1: { enabled: true },
          app2: { enabled: true },
        },
      };
      expect(checkConf(conf, "apps/*/enabled", "and")).toBe(true);
    });

    it("should return false for AND when any is false", () => {
      const conf = {
        apps: {
          app1: { enabled: true },
          app2: { enabled: false },
        },
      };
      expect(checkConf(conf, "apps/*/enabled", "and")).toBe(false);
    });

    it("should return true for non-empty hash object", () => {
      const conf = { grantSessionRules: { rule1: "expr1" } };
      expect(checkConf(conf, "grantSessionRules")).toBe(true);
    });

    it("should return false for empty hash object", () => {
      const conf = { grantSessionRules: {} };
      expect(checkConf(conf, "grantSessionRules")).toBe(false);
    });

    it("should handle truthy string values", () => {
      const conf = { someKey: "value" };
      expect(checkConf(conf, "someKey")).toBe(true);
    });

    it("should handle truthy number values", () => {
      const conf = { someKey: 1 };
      expect(checkConf(conf, "someKey")).toBe(true);
    });

    it("should handle empty wildcard results", () => {
      const conf = { oidcRPMetaDataOptions: {} };
      expect(
        checkConf(conf, "oidcRPMetaDataOptions/*/someKey", "or")
      ).toBe(false);
    });
  });

  describe("parseConfigCondition", () => {
    it("should parse simple condition", () => {
      const result = parseConfigCondition("cda");
      expect(result).toEqual({ path: "cda" });
    });

    it("should parse or:: prefix", () => {
      const result = parseConfigCondition("or::path/*/key");
      expect(result).toEqual({ type: "or", path: "path/*/key" });
    });

    it("should parse and:: prefix", () => {
      const result = parseConfigCondition("and::path/*/key");
      expect(result).toEqual({ type: "and", path: "path/*/key" });
    });
  });

  describe("shouldEnablePlugin", () => {
    it("should return true for simple enabled key", () => {
      const conf = { cda: true };
      expect(shouldEnablePlugin(conf, "cda")).toBe(true);
    });

    it("should return false for disabled key", () => {
      const conf = { cda: false };
      expect(shouldEnablePlugin(conf, "cda")).toBe(false);
    });

    it("should handle array of keys (any match)", () => {
      const conf = { key1: false, key2: true };
      expect(shouldEnablePlugin(conf, ["key1", "key2"])).toBe(true);
    });

    it("should handle compound OR condition", () => {
      const conf = { singleSession: false, singleIP: true };
      expect(
        shouldEnablePlugin(conf, "singleSession", {
          type: "or",
          keys: ["singleSession", "singleIP", "singleUserByIP"],
        })
      ).toBe(true);
    });

    it("should handle compound AND condition", () => {
      const conf = { key1: true, key2: true };
      expect(
        shouldEnablePlugin(conf, "key1", {
          type: "and",
          keys: ["key1", "key2"],
        })
      ).toBe(true);
    });

    it("should handle wildcard path", () => {
      const conf = {
        oidcRPMetaDataOptions: {
          app1: { oidcRPMetaDataOptionsAllowNativeSso: true },
        },
      };
      expect(
        shouldEnablePlugin(conf, "oidcNativeSso", undefined, {
          type: "or",
          path: "oidcRPMetaDataOptions/*/oidcRPMetaDataOptionsAllowNativeSso",
        })
      ).toBe(true);
    });
  });
});
