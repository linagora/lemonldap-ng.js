import { describe, it, expect, vi, beforeEach } from "vitest";
import { BasePlugin } from "./index";
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
  testOption: "testValue",
} as LLNG_Conf;

// Mock portal
const mockPortal = {
  getConf: () => baseConf,
  getLogger: () => mockLogger,
} as any;

// Concrete implementation for testing
class TestPlugin extends BasePlugin {
  readonly name = "TestPlugin";
  onInitCalled = false;

  protected async onInit(): Promise<boolean> {
    this.onInitCalled = true;
    return true;
  }
}

// Plugin that returns false from onInit
class FailingPlugin extends BasePlugin {
  readonly name = "FailingPlugin";

  protected async onInit(): Promise<boolean> {
    return false;
  }
}

describe("BasePlugin", () => {
  let plugin: TestPlugin;

  beforeEach(async () => {
    vi.clearAllMocks();
    plugin = new TestPlugin();
    await plugin.init({
      portal: mockPortal,
      conf: baseConf,
      logger: mockLogger,
    });
  });

  describe("Initialization", () => {
    it("should initialize successfully", async () => {
      const newPlugin = new TestPlugin();
      const result = await newPlugin.init({
        portal: mockPortal,
        conf: baseConf,
        logger: mockLogger,
      });
      expect(result).toBe(true);
      expect(newPlugin.onInitCalled).toBe(true);
    });

    it("should return false if onInit returns false", async () => {
      const failingPlugin = new FailingPlugin();
      const result = await failingPlugin.init({
        portal: mockPortal,
        conf: baseConf,
        logger: mockLogger,
      });
      expect(result).toBe(false);
    });
  });

  describe("Logging helpers", () => {
    it("should log debug messages", () => {
      (plugin as any).debug("test message");
      expect(mockLogger.debug).toHaveBeenCalledWith("[TestPlugin] test message");
    });

    it("should log info messages", () => {
      (plugin as any).info("test message");
      expect(mockLogger.info).toHaveBeenCalledWith("[TestPlugin] test message");
    });

    it("should log warn messages", () => {
      (plugin as any).warn("test message");
      expect(mockLogger.warn).toHaveBeenCalledWith("[TestPlugin] test message");
    });

    it("should log error messages", () => {
      (plugin as any).error("test message");
      expect(mockLogger.error).toHaveBeenCalledWith("[TestPlugin] test message");
    });
  });

  describe("Configuration access", () => {
    it("should get configuration value", () => {
      const value = (plugin as any).getConf("testOption");
      expect(value).toBe("testValue");
    });

    it("should return default for missing key", () => {
      const value = (plugin as any).getConf("missingKey", "defaultValue");
      expect(value).toBe("defaultValue");
    });

    it("should return undefined for missing key without default", () => {
      const value = (plugin as any).getConf("missingKey");
      expect(value).toBeUndefined();
    });
  });

  describe("Cleanup", () => {
    it("should have close method that resolves", async () => {
      await expect(plugin.close()).resolves.toBeUndefined();
    });
  });
});
