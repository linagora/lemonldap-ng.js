/**
 * Configuration checker with wildcard support
 *
 * Supports paths like:
 * - "simple" - direct key lookup
 * - "nested/path" - nested key lookup
 * - "oidcRPMetaDataOptions/star/oidcRPMetaDataOptionsAllowNativeSso" - wildcard (star = asterisk)
 */

/**
 * Check if a configuration path has a truthy value
 * Supports wildcard paths like "oidcRPMetaDataOptions/star/oidcRPMetaDataOptionsAllowNativeSso" (star = asterisk)
 *
 * @param conf - Configuration object
 * @param path - Path to check (with / separators, * for wildcard)
 * @param type - How to combine multiple results from wildcards ('or' = any truthy, 'and' = all truthy)
 * @returns true if the path resolves to a truthy value
 */
export function checkConf(
  conf: Record<string, any>,
  path: string,
  type: "or" | "and" = "or",
): boolean {
  const parts = path.split("/");

  function recurse(obj: any, remainingParts: string[]): boolean {
    // Base case: no more parts to process
    if (remainingParts.length === 0) {
      // Handle hash refs like in Perl (scalar(%$c))
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        return Object.keys(obj).length > 0;
      }
      return !!obj;
    }

    // Can't traverse if obj is null/undefined/primitive
    if (!obj || typeof obj !== "object") {
      return false;
    }

    const [current, ...rest] = remainingParts;

    // Wildcard: check all keys
    if (current === "*") {
      const keys = Object.keys(obj);
      if (keys.length === 0) return false;

      const results = keys.map((k) => recurse(obj[k], rest));

      if (type === "or") {
        return results.some(Boolean);
      } else if (type === "and") {
        return results.every(Boolean);
      }
      return false;
    }

    // Regular key: descend into that key
    return recurse(obj[current], rest);
  }

  return recurse(conf, parts);
}

/**
 * Parse a Perl-style config condition
 * Examples:
 * - "cda" -> { key: "cda" }
 * - "or::oidcRPMetaDataOptions/star/oidcRPMetaDataOptionsAllowNativeSso" (star = asterisk)
 *   Returns: { type: "or", path: "oidcRPMetaDataOptions/star/..." }
 */
export interface ParsedCondition {
  type?: "or" | "and";
  path: string;
}

export function parseConfigCondition(condition: string): ParsedCondition {
  // Check for type prefix like "or::" or "and::"
  const match = condition.match(/^(or|and)::(.+)$/);
  if (match) {
    return {
      type: match[1] as "or" | "and",
      path: match[2],
    };
  }
  return { path: condition };
}

/**
 * Check if a plugin should be enabled based on its configuration condition
 */
export function shouldEnablePlugin(
  conf: Record<string, any>,
  configKeys: string | string[],
  compoundCondition?: { type: "or" | "and"; keys: string[] },
  wildcardPath?: { type: "or" | "and"; path: string },
): boolean {
  // Wildcard path takes precedence
  if (wildcardPath) {
    return checkConf(conf, wildcardPath.path, wildcardPath.type);
  }

  // Compound condition
  if (compoundCondition) {
    const results = compoundCondition.keys.map((key) => {
      const parsed = parseConfigCondition(key);
      return checkConf(conf, parsed.path, parsed.type || "or");
    });

    if (compoundCondition.type === "or") {
      return results.some(Boolean);
    } else {
      return results.every(Boolean);
    }
  }

  // Simple key(s)
  const keys = Array.isArray(configKeys) ? configKeys : [configKeys];

  for (const key of keys) {
    const parsed = parseConfigCondition(key);
    if (checkConf(conf, parsed.path, parsed.type || "or")) {
      return true;
    }
  }

  return false;
}
