import { describe, it, expect, vi, beforeEach } from "vitest";
import CDAPlugin from "./index";
import type { PluginContext } from "@lemonldap-ng/portal";
import type { LLNG_Conf, LLNG_Logger } from "@lemonldap-ng/types";

// Mock logger
const mockLogger: LLNG_Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  notice: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Base configuration
const baseConf = {
  cfgNum: 1,
  globalStorage: "Apache::Session::File",
  globalStorageOptions: {},
  portal: "http://auth.example.com",
  cookieName: "lemonldap",
  domain: ".example.com",
  securedCookie: 0,
} as LLNG_Conf;

// Mock portal
const mockPortal = {
  getConf: () => baseConf,
  getLogger: () => mockLogger,
  getSessionAccessor: () => ({
    get: vi.fn(),
    update: vi.fn(),
  }),
} as any;

describe("CDAPlugin", () => {
  let plugin: CDAPlugin;
  let context: PluginContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    plugin = new CDAPlugin();
    context = {
      portal: mockPortal,
      conf: baseConf,
      logger: mockLogger,
    };
    await plugin.init(context);
  });

  describe("Initialization", () => {
    it("should initialize successfully", async () => {
      const newPlugin = new CDAPlugin();
      const result = await newPlugin.init(context);
      expect(result).toBe(true);
    });

    it("should have the correct name", () => {
      expect(plugin.name).toBe("CDA");
    });
  });

  describe("endAuth hook", () => {
    it("should return ok for internal URLs", async () => {
      const req = {
        llngSession: { _session_id: "sess123" },
        llngSessionId: "sess123",
        llngUrldc: "http://app.example.com/path",
      };

      const result = await plugin.endAuth(req);
      expect(result.code).toBe(0); // PE_OK
    });

    it("should return ok when no session", async () => {
      const req = {
        llngUrldc: "http://external.com/path",
      };

      const result = await plugin.endAuth(req);
      expect(result.code).toBe(0); // PE_OK
    });
  });

  describe("forAuthUser hook", () => {
    it("should return ok for internal URLs", async () => {
      const req = {
        llngSession: { _session_id: "sess123" },
        llngSessionId: "sess123",
        llngUrldc: "http://app.example.com/path",
      };

      const result = await plugin.forAuthUser(req);
      expect(result.code).toBe(0); // PE_OK
    });
  });
});
