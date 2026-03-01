import type { Router } from "express";
import type { LLNG_Conf, LLNG_Logger } from "@lemonldap-ng/types";
import type { Portal } from "../portal";
import type { PortalRequest } from "../types";
import type {
  Plugin,
  PluginContext,
  PluginResult,
  PluginRegistration,
} from "./types";
import { PE_OK } from "./types";
import { getSortedRegistry } from "./registry";
import { shouldEnablePlugin } from "./config-checker";

type HookName =
  | "beforeAuth"
  | "betweenAuthAndData"
  | "afterData"
  | "endAuth"
  | "beforeLogout"
  | "forAuthUser";

/**
 * PluginManager - manages plugin lifecycle and hook execution
 *
 * This is the JavaScript equivalent of the Perl plugin loading system.
 * It handles:
 * - Plugin discovery based on configuration
 * - Dynamic loading via npm packages
 * - Hook registration and execution
 * - Route registration
 */
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private hookRegistry: Map<HookName, Plugin[]> = new Map();
  private conf: LLNG_Conf;
  private logger: LLNG_Logger;
  private portal: Portal | null = null;

  constructor(conf: LLNG_Conf, logger: LLNG_Logger) {
    this.conf = conf;
    this.logger = logger;

    // Initialize hook registry
    const hookNames: HookName[] = [
      "beforeAuth",
      "betweenAuthAndData",
      "afterData",
      "endAuth",
      "beforeLogout",
      "forAuthUser",
    ];
    for (const hook of hookNames) {
      this.hookRegistry.set(hook, []);
    }
  }

  /**
   * Initialize all enabled plugins
   */
  async init(portal: Portal): Promise<void> {
    this.portal = portal;
    const registry = getSortedRegistry();
    const customPlugins = this.getCustomPlugins();

    this.logger.debug(
      `Plugin system: checking ${registry.length} registered plugins`,
    );

    // Load plugins from registry
    for (const registration of registry) {
      const enabled = shouldEnablePlugin(
        this.conf,
        registration.configKeys,
        registration.compoundCondition,
        registration.wildcardPath,
      );

      if (enabled) {
        await this.loadPlugin(registration);
      }
    }

    // Load custom plugins from configuration
    for (const packageName of customPlugins) {
      await this.loadPlugin({ configKeys: "_custom", packageName });
    }

    this.logger.info(`Plugin system: ${this.plugins.size} plugins loaded`);
  }

  /**
   * Get custom plugins from configuration
   */
  private getCustomPlugins(): string[] {
    const customPlugins = this.conf.customPlugins;
    if (!customPlugins) return [];

    if (Array.isArray(customPlugins)) {
      return customPlugins.filter((p) => typeof p === "string" && p.trim());
    }

    if (typeof customPlugins === "string") {
      return customPlugins
        .split(/[,\s]+/)
        .map((p) => p.trim())
        .filter(Boolean);
    }

    return [];
  }

  /**
   * Load a single plugin
   */
  private async loadPlugin(registration: PluginRegistration): Promise<void> {
    const { packageName } = registration;

    try {
      this.logger.debug(`Loading plugin: ${packageName}`);

      // Dynamic import
      const mod = await import(packageName);

      // Get plugin class (default export) or factory
      let plugin: Plugin;
      if (mod.createPlugin) {
        plugin = mod.createPlugin();
      } else if (mod.default) {
        const PluginClass = mod.default;
        plugin = new PluginClass();
      } else {
        throw new Error(
          `Plugin ${packageName} has no default export or createPlugin function`,
        );
      }

      // Create context
      const context: PluginContext = {
        portal: this.portal!,
        conf: this.conf,
        logger: this.logger,
      };

      // Initialize plugin
      const success = await plugin.init(context);
      if (!success) {
        this.logger.warn(
          `Plugin ${plugin.name} initialization returned false, skipping`,
        );
        return;
      }

      // Register plugin
      this.plugins.set(plugin.name, plugin);

      // Register hooks
      this.registerHooks(plugin);

      this.logger.debug(`Plugin ${plugin.name} loaded successfully`);
    } catch (error) {
      // Only warn for missing packages (plugin not installed)
      if (
        (error as any)?.code === "ERR_MODULE_NOT_FOUND" ||
        (error as any)?.code === "MODULE_NOT_FOUND"
      ) {
        this.logger.debug(
          `Plugin package ${packageName} not installed, skipping`,
        );
      } else {
        this.logger.error(`Failed to load plugin ${packageName}: ${error}`);
      }
    }
  }

  /**
   * Register plugin hooks
   */
  private registerHooks(plugin: Plugin): void {
    const hookNames: HookName[] = [
      "beforeAuth",
      "betweenAuthAndData",
      "afterData",
      "endAuth",
      "beforeLogout",
      "forAuthUser",
    ];

    for (const hookName of hookNames) {
      if (typeof (plugin as any)[hookName] === "function") {
        this.hookRegistry.get(hookName)!.push(plugin);
        this.logger.debug(
          `Plugin ${plugin.name} registered for hook: ${hookName}`,
        );
      }
    }
  }

  /**
   * Execute a lifecycle hook
   * Returns the first non-OK result, or PE_OK if all succeed
   */
  async executeHook(
    hookName: HookName,
    req: PortalRequest,
  ): Promise<PluginResult> {
    const plugins = this.hookRegistry.get(hookName) || [];

    for (const plugin of plugins) {
      try {
        const hookFn = (plugin as any)[hookName];
        if (hookFn) {
          const result = await hookFn.call(plugin, req);

          // Stop on non-OK result or if stop flag is set
          if (result.code !== PE_OK || result.stop) {
            this.logger.debug(
              `Plugin ${plugin.name}.${hookName} returned code ${result.code}${result.stop ? " (stop)" : ""}`,
            );
            return result;
          }
        }
      } catch (error) {
        this.logger.error(
          `Plugin ${plugin.name}.${hookName} threw error: ${error}`,
        );
        // Continue with other plugins on error
      }
    }

    return { code: PE_OK };
  }

  /**
   * Register plugin routes on the router
   */
  registerRoutes(router: Router): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.registerRoutes) {
        try {
          plugin.registerRoutes(router);
          this.logger.debug(`Plugin ${plugin.name} registered routes`);
        } catch (error) {
          this.logger.error(
            `Plugin ${plugin.name} failed to register routes: ${error}`,
          );
        }
      }
    }
  }

  /**
   * Register authenticated-only routes
   */
  registerAuthRoutes(router: Router): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.registerAuthRoutes) {
        try {
          plugin.registerAuthRoutes(router);
          this.logger.debug(`Plugin ${plugin.name} registered auth routes`);
        } catch (error) {
          this.logger.error(
            `Plugin ${plugin.name} failed to register auth routes: ${error}`,
          );
        }
      }
    }
  }

  /**
   * Register unauthenticated routes
   */
  registerUnauthRoutes(router: Router): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.registerUnauthRoutes) {
        try {
          plugin.registerUnauthRoutes(router);
          this.logger.debug(`Plugin ${plugin.name} registered unauth routes`);
        } catch (error) {
          this.logger.error(
            `Plugin ${plugin.name} failed to register unauth routes: ${error}`,
          );
        }
      }
    }
  }

  /**
   * Get a loaded plugin by name
   */
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Check if a plugin is loaded
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Cleanup all plugins
   */
  async close(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.close) {
        try {
          await plugin.close();
          this.logger.debug(`Plugin ${plugin.name} closed`);
        } catch (error) {
          this.logger.error(`Plugin ${plugin.name} failed to close: ${error}`);
        }
      }
    }
    this.plugins.clear();
    for (const hooks of this.hookRegistry.values()) {
      hooks.length = 0;
    }
  }
}

export default PluginManager;
