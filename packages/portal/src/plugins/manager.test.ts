import { vi, describe, it, expect, beforeEach } from "vitest";
import { PluginManager } from "./manager";
import type { LLNG_Conf, LLNG_Logger } from "@lemonldap-ng/types";
import type { Plugin, PluginContext, PluginResult } from "./types";
import { PE_OK, PE_ERROR } from "./types";

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
} as LLNG_Conf;

// Mock portal
const mockPortal = {
  getConf: () => baseConf,
  getLogger: () => mockLogger,
  getSessionAccessor: () => ({ get: vi.fn(), update: vi.fn() }),
} as any;

// Mock plugin for testing
class MockPlugin implements Plugin {
  readonly name: string;
  initCalled = false;
  closeCalled = false;
  beforeAuthCalls: any[] = [];
  endAuthCalls: any[] = [];

  constructor(name = "MockPlugin") {
    this.name = name;
  }

  async init(_context: PluginContext): Promise<boolean> {
    this.initCalled = true;
    return true;
  }

  async beforeAuth(req: any): Promise<PluginResult> {
    this.beforeAuthCalls.push(req);
    return { code: PE_OK };
  }

  async endAuth(req: any): Promise<PluginResult> {
    this.endAuthCalls.push(req);
    return { code: PE_OK };
  }

  async close(): Promise<void> {
    this.closeCalled = true;
  }
}

// Mock plugin that returns error
class ErrorPlugin implements Plugin {
  readonly name = "ErrorPlugin";

  async init(_context: PluginContext): Promise<boolean> {
    return true;
  }

  async beforeAuth(_req: any): Promise<PluginResult> {
    return { code: PE_ERROR, error: "Test error", stop: true };
  }
}

// Mock failed init plugin
class FailedInitPlugin implements Plugin {
  readonly name = "FailedInitPlugin";

  async init(_context: PluginContext): Promise<boolean> {
    return false;
  }
}

describe("PluginManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize without plugins when none enabled", async () => {
      const manager = new PluginManager(baseConf, mockLogger);
      await manager.init(mockPortal);

      expect(manager.getAllPlugins()).toHaveLength(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("0 plugins loaded")
      );
    });

    it("should log debug message about checking plugins", async () => {
      const manager = new PluginManager(baseConf, mockLogger);
      await manager.init(mockPortal);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("checking")
      );
    });
  });

  describe("Hook execution", () => {
    it("should return PE_OK when no plugins registered", async () => {
      const manager = new PluginManager(baseConf, mockLogger);
      await manager.init(mockPortal);

      const result = await manager.executeHook("beforeAuth", {} as any);
      expect(result.code).toBe(PE_OK);
    });

    it("should execute hooks in order", async () => {
      const manager = new PluginManager(baseConf, mockLogger);
      await manager.init(mockPortal);

      // Manually add mock plugins for testing
      const plugin1 = new MockPlugin("Plugin1");
      const plugin2 = new MockPlugin("Plugin2");

      await plugin1.init({ portal: mockPortal, conf: baseConf, logger: mockLogger });
      await plugin2.init({ portal: mockPortal, conf: baseConf, logger: mockLogger });

      // Access private members for testing
      (manager as any).plugins.set("Plugin1", plugin1);
      (manager as any).plugins.set("Plugin2", plugin2);
      (manager as any).hookRegistry.get("beforeAuth")!.push(plugin1, plugin2);

      const mockReq = { test: "data" };
      await manager.executeHook("beforeAuth", mockReq as any);

      expect(plugin1.beforeAuthCalls).toHaveLength(1);
      expect(plugin2.beforeAuthCalls).toHaveLength(1);
    });

    it("should stop on error result", async () => {
      const manager = new PluginManager(baseConf, mockLogger);
      await manager.init(mockPortal);

      const errorPlugin = new ErrorPlugin();
      const normalPlugin = new MockPlugin();

      await errorPlugin.init({ portal: mockPortal, conf: baseConf, logger: mockLogger });
      await normalPlugin.init({ portal: mockPortal, conf: baseConf, logger: mockLogger });

      (manager as any).plugins.set("ErrorPlugin", errorPlugin);
      (manager as any).plugins.set("MockPlugin", normalPlugin);
      (manager as any).hookRegistry.get("beforeAuth")!.push(errorPlugin, normalPlugin);

      const result = await manager.executeHook("beforeAuth", {} as any);

      expect(result.code).toBe(PE_ERROR);
      expect(result.stop).toBe(true);
      expect(normalPlugin.beforeAuthCalls).toHaveLength(0); // Should not be called
    });
  });

  describe("Plugin retrieval", () => {
    it("should get plugin by name", async () => {
      const manager = new PluginManager(baseConf, mockLogger);
      await manager.init(mockPortal);

      const plugin = new MockPlugin();
      (manager as any).plugins.set("MockPlugin", plugin);

      expect(manager.getPlugin("MockPlugin")).toBe(plugin);
    });

    it("should return undefined for unknown plugin", async () => {
      const manager = new PluginManager(baseConf, mockLogger);
      await manager.init(mockPortal);

      expect(manager.getPlugin("Unknown")).toBeUndefined();
    });

    it("should check if plugin exists", async () => {
      const manager = new PluginManager(baseConf, mockLogger);
      await manager.init(mockPortal);

      const plugin = new MockPlugin();
      (manager as any).plugins.set("MockPlugin", plugin);

      expect(manager.hasPlugin("MockPlugin")).toBe(true);
      expect(manager.hasPlugin("Unknown")).toBe(false);
    });
  });

  describe("Cleanup", () => {
    it("should call close on all plugins", async () => {
      const manager = new PluginManager(baseConf, mockLogger);
      await manager.init(mockPortal);

      const plugin = new MockPlugin();
      await plugin.init({ portal: mockPortal, conf: baseConf, logger: mockLogger });
      (manager as any).plugins.set("MockPlugin", plugin);

      await manager.close();

      expect(plugin.closeCalled).toBe(true);
      expect(manager.getAllPlugins()).toHaveLength(0);
    });
  });

  describe("Custom plugins from config", () => {
    it("should parse custom plugins from string", async () => {
      const conf = {
        ...baseConf,
        customPlugins: "@my/plugin1, @my/plugin2",
      } as LLNG_Conf;

      const manager = new PluginManager(conf, mockLogger);

      // Access private method for testing
      const customPlugins = (manager as any).getCustomPlugins();

      expect(customPlugins).toEqual(["@my/plugin1", "@my/plugin2"]);
    });

    it("should parse custom plugins from array", async () => {
      const conf = {
        ...baseConf,
        customPlugins: ["@my/plugin1", "@my/plugin2"],
      } as LLNG_Conf;

      const manager = new PluginManager(conf, mockLogger);

      const customPlugins = (manager as any).getCustomPlugins();

      expect(customPlugins).toEqual(["@my/plugin1", "@my/plugin2"]);
    });

    it("should return empty array when no custom plugins", async () => {
      const manager = new PluginManager(baseConf, mockLogger);

      const customPlugins = (manager as any).getCustomPlugins();

      expect(customPlugins).toEqual([]);
    });
  });
});
