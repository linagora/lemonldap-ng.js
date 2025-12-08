/**
 * Tests for TwoFactorManager
 */

import { TwoFactorManager } from "./manager";
import type { LLNG_Conf, LLNG_Logger, LLNG_Session } from "@lemonldap-ng/types";
import type { UserData } from "../types";

// Mock logger
const mockLogger: LLNG_Logger = {
  debug: jest.fn(),
  info: jest.fn(),
  notice: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Base configuration
const baseConf = {
  cfgNum: 1,
  globalStorage: "Apache::Session::File",
  globalStorageOptions: {},
  portal: "http://auth.example.com",
  cookieName: "lemonldap",
} as LLNG_Conf;

// Helper to create mock user data
function createUserData(uid: string): UserData {
  return { uid, attributes: { uid } };
}

describe("TwoFactorManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize without 2FA modules when none configured", async () => {
      const manager = new TwoFactorManager(baseConf, mockLogger);
      await manager.init();

      expect(manager.is2FAEnabled()).toBe(false);
      expect(manager.getAllModules()).toHaveLength(0);
    });

    it("should log initialization message", async () => {
      const manager = new TwoFactorManager(baseConf, mockLogger);
      await manager.init();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("2FA Manager initialized"),
      );
    });
  });

  describe("TOTP Module Loading", () => {
    it("should load TOTP module when activated", async () => {
      const conf: LLNG_Conf = {
        ...baseConf,
        totp2fActivation: true,
      };

      const manager = new TwoFactorManager(conf, mockLogger);
      await manager.init();

      expect(manager.is2FAEnabled()).toBe(true);
      expect(manager.getModule("totp")).toBeDefined();
      expect(manager.getRegisterModule("totp")).toBeDefined();
    });

    it("should configure TOTP with custom settings", async () => {
      const conf: LLNG_Conf = {
        ...baseConf,
        totp2fActivation: true,
        totp2fIssuer: "My Company",
        totp2fInterval: 60,
        totp2fDigits: 8,
        totp2fRange: 2,
      };

      const manager = new TwoFactorManager(conf, mockLogger);
      await manager.init();

      const module = manager.getModule("totp");
      expect(module).toBeDefined();
    });
  });

  describe("is2FARequired", () => {
    let manager: TwoFactorManager;

    beforeEach(async () => {
      const conf: LLNG_Conf = {
        ...baseConf,
        totp2fActivation: true,
      };
      manager = new TwoFactorManager(conf, mockLogger);
      await manager.init();
    });

    it("should return false when no devices registered", () => {
      const session: LLNG_Session = {
        _session_id: "sess123",
        _utime: Math.floor(Date.now() / 1000),
        _user: "testuser",
      };

      expect(manager.is2FARequired(session)).toBe(false);
    });

    it("should return false for empty devices array", () => {
      const session: LLNG_Session = {
        _session_id: "sess123",
        _utime: Math.floor(Date.now() / 1000),
        _user: "testuser",
        _2fDevices: "[]",
      };

      expect(manager.is2FARequired(session)).toBe(false);
    });

    it("should return true when TOTP device registered", () => {
      const session: LLNG_Session = {
        _session_id: "sess123",
        _utime: Math.floor(Date.now() / 1000),
        _user: "testuser",
        _2fDevices: JSON.stringify([
          { type: "TOTP", name: "My TOTP", epoch: 1234567890 },
        ]),
      };

      expect(manager.is2FARequired(session)).toBe(true);
    });

    it("should handle invalid JSON in _2fDevices", () => {
      const session: LLNG_Session = {
        _session_id: "sess123",
        _utime: Math.floor(Date.now() / 1000),
        _user: "testuser",
        _2fDevices: "not valid json",
      };

      expect(manager.is2FARequired(session)).toBe(false);
    });
  });

  describe("getAvailableModules", () => {
    let manager: TwoFactorManager;

    beforeEach(async () => {
      const conf: LLNG_Conf = {
        ...baseConf,
        totp2fActivation: true,
      };
      manager = new TwoFactorManager(conf, mockLogger);
      await manager.init();
    });

    it("should return empty array when no devices", () => {
      const session: LLNG_Session = {
        _session_id: "sess123",
        _utime: Math.floor(Date.now() / 1000),
        _user: "testuser",
      };

      expect(manager.getAvailableModules(session)).toHaveLength(0);
    });

    it("should return TOTP module when TOTP device registered", () => {
      const session: LLNG_Session = {
        _session_id: "sess123",
        _utime: Math.floor(Date.now() / 1000),
        _user: "testuser",
        _2fDevices: JSON.stringify([
          { type: "TOTP", name: "My TOTP", epoch: 1234567890 },
        ]),
      };

      const available = manager.getAvailableModules(session);
      expect(available).toHaveLength(1);
      expect(available[0].type).toBe("TOTP");
    });
  });

  describe("Pending sessions", () => {
    let manager: TwoFactorManager;

    beforeEach(async () => {
      manager = new TwoFactorManager(baseConf, mockLogger);
      await manager.init();
    });

    it("should create pending session with token", () => {
      const token = manager.createPendingSession(
        "testuser",
        createUserData("testuser"),
        { user: "testuser", password: "pass" },
        ["totp"],
        "http://app.example.com",
      );

      expect(token).toBeTruthy();
      expect(token.length).toBe(64); // 32 bytes hex
    });

    it("should retrieve pending session by token", () => {
      const token = manager.createPendingSession(
        "testuser",
        createUserData("testuser"),
        { user: "testuser", password: "pass" },
        ["totp"],
        "http://app.example.com",
      );

      const pending = manager.getPendingSession(token);
      expect(pending).toBeTruthy();
      expect(pending!.user).toBe("testuser");
      expect(pending!.urldc).toBe("http://app.example.com");
      expect(pending!.availableModules).toContain("totp");
    });

    it("should return null for non-existent token", () => {
      const pending = manager.getPendingSession("non-existent-token");
      expect(pending).toBeNull();
    });

    it("should delete pending session", () => {
      const token = manager.createPendingSession(
        "testuser",
        createUserData("testuser"),
        { user: "testuser", password: "pass" },
        ["totp"],
      );

      manager.deletePendingSession(token);

      const pending = manager.getPendingSession(token);
      expect(pending).toBeNull();
    });

    it("should store credentials in pending session", () => {
      const credentials = { user: "testuser", password: "secretpass" };
      const token = manager.createPendingSession(
        "testuser",
        createUserData("testuser"),
        credentials,
        ["totp"],
      );

      const pending = manager.getPendingSession(token);
      expect(pending!.credentials).toEqual(credentials);
    });
  });

  describe("Module retrieval", () => {
    let manager: TwoFactorManager;

    beforeEach(async () => {
      const conf: LLNG_Conf = {
        ...baseConf,
        totp2fActivation: true,
      };
      manager = new TwoFactorManager(conf, mockLogger);
      await manager.init();
    });

    it("should get module by prefix", () => {
      const module = manager.getModule("totp");
      expect(module).toBeDefined();
      expect(module!.prefix).toBe("totp");
    });

    it("should return undefined for unknown prefix", () => {
      const module = manager.getModule("unknown");
      expect(module).toBeUndefined();
    });

    it("should get registration module by prefix", () => {
      const module = manager.getRegisterModule("totp");
      expect(module).toBeDefined();
      expect(module!.prefix).toBe("totp");
    });

    it("should get all modules", () => {
      const modules = manager.getAllModules();
      expect(modules).toHaveLength(1);
      expect(modules[0].type).toBe("TOTP");
    });

    it("should get all registration modules", () => {
      const modules = manager.getAllRegisterModules();
      expect(modules).toHaveLength(1);
      expect(modules[0].type).toBe("TOTP");
    });
  });

  describe("sessionToInfo", () => {
    it("should convert LLNG_Session to TwoFactorSessionInfo", async () => {
      const manager = new TwoFactorManager(baseConf, mockLogger);
      await manager.init();

      const session: LLNG_Session = {
        _session_id: "sess123",
        _utime: Math.floor(Date.now() / 1000),
        _user: "testuser",
        uid: "testuser",
        _2fDevices: '[{"type":"TOTP","name":"My TOTP","epoch":123}]',
      };

      const info = manager.sessionToInfo(session);
      expect(info.sessionId).toBe("sess123");
      expect(info.user).toBe("testuser");
      expect(info._2fDevices).toBe(session._2fDevices);
    });

    it("should handle missing uid", async () => {
      const manager = new TwoFactorManager(baseConf, mockLogger);
      await manager.init();

      const session: LLNG_Session = {
        _session_id: "sess123",
        _utime: Math.floor(Date.now() / 1000),
        _user: "fallback_user",
      };

      const info = manager.sessionToInfo(session);
      expect(info.user).toBe("fallback_user");
    });
  });

  describe("Challenge and verification", () => {
    let manager: TwoFactorManager;

    beforeEach(async () => {
      const conf: LLNG_Conf = {
        ...baseConf,
        totp2fActivation: true,
      };
      manager = new TwoFactorManager(conf, mockLogger);
      await manager.init();
    });

    it("should throw error for unknown module in generateChallenge", async () => {
      const sessionInfo = {
        sessionId: "sess123",
        user: "testuser",
      };

      await expect(
        manager.generateChallenge("unknown", {} as any, sessionInfo, "token"),
      ).rejects.toThrow("Unknown 2FA module");
    });

    it("should return error result for unknown module in verify", async () => {
      const sessionInfo = {
        sessionId: "sess123",
        user: "testuser",
      };

      const result = await manager.verify("unknown", {} as any, sessionInfo);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown 2FA module");
    });
  });
});
