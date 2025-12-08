/**
 * Tests for 2fa-common device registry
 */

import {
  parseDevices,
  serializeDevices,
  getDevices,
  getDevicesByType,
  hasDeviceOfType,
  hasAnyDevice,
  findDevice,
  findDeviceByKey,
  addDevice,
  removeDevice,
  updateDevice,
  removeExpiredDevices,
  sanitizeDeviceName,
  generateDefaultName,
  DeviceRegistry,
  MAX_DEVICE_NAME_LENGTH,
} from "./devices";
import type { TwoFactorDevice, TwoFactorSessionInfo } from "./types";

describe("Device parsing and serialization", () => {
  describe("parseDevices", () => {
    it("should return empty array for undefined input", () => {
      expect(parseDevices(undefined)).toEqual([]);
    });

    it("should return empty array for empty string", () => {
      expect(parseDevices("")).toEqual([]);
    });

    it("should return empty array for invalid JSON", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      expect(parseDevices("not json")).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should return empty array for non-array JSON", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      expect(parseDevices('{"foo": "bar"}')).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should parse valid device array", () => {
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "My TOTP", epoch: 1234567890 },
      ];
      expect(parseDevices(JSON.stringify(devices))).toEqual(devices);
    });
  });

  describe("serializeDevices", () => {
    it("should serialize empty array", () => {
      expect(serializeDevices([])).toBe("[]");
    });

    it("should serialize device array", () => {
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "My TOTP", epoch: 1234567890 },
      ];
      expect(serializeDevices(devices)).toBe(JSON.stringify(devices));
    });
  });
});

describe("Device getters", () => {
  const createSession = (devices: TwoFactorDevice[]): TwoFactorSessionInfo => ({
    sessionId: "test-session",
    user: "testuser",
    _2fDevices: JSON.stringify(devices),
  });

  describe("getDevices", () => {
    it("should return all devices from session", () => {
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "My TOTP", epoch: 1234567890 },
        { type: "WebAuthn", name: "My Key", epoch: 1234567891 },
      ];
      const session = createSession(devices);
      expect(getDevices(session)).toEqual(devices);
    });
  });

  describe("getDevicesByType", () => {
    it("should filter devices by type", () => {
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "TOTP 1", epoch: 1234567890 },
        { type: "WebAuthn", name: "Key 1", epoch: 1234567891 },
        { type: "TOTP", name: "TOTP 2", epoch: 1234567892 },
      ];
      const session = createSession(devices);
      const totpDevices = getDevicesByType(session, "TOTP");
      expect(totpDevices).toHaveLength(2);
      expect(totpDevices.every((d) => d.type === "TOTP")).toBe(true);
    });
  });

  describe("hasDeviceOfType", () => {
    it("should return true when device type exists", () => {
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "My TOTP", epoch: 1234567890 },
      ];
      expect(hasDeviceOfType(createSession(devices), "TOTP")).toBe(true);
    });

    it("should return false when device type does not exist", () => {
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "My TOTP", epoch: 1234567890 },
      ];
      expect(hasDeviceOfType(createSession(devices), "WebAuthn")).toBe(false);
    });
  });

  describe("hasAnyDevice", () => {
    it("should return true when devices exist", () => {
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "My TOTP", epoch: 1234567890 },
      ];
      expect(hasAnyDevice(createSession(devices))).toBe(true);
    });

    it("should return false when no devices", () => {
      expect(hasAnyDevice(createSession([]))).toBe(false);
    });
  });

  describe("findDevice", () => {
    it("should find device by type and epoch", () => {
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "TOTP 1", epoch: 1234567890 },
        { type: "TOTP", name: "TOTP 2", epoch: 1234567891 },
      ];
      const session = createSession(devices);
      const found = findDevice(session, "TOTP", 1234567891);
      expect(found).toEqual(devices[1]);
    });

    it("should return undefined when not found", () => {
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "TOTP 1", epoch: 1234567890 },
      ];
      const session = createSession(devices);
      expect(findDevice(session, "TOTP", 9999999999)).toBeUndefined();
    });
  });

  describe("findDeviceByKey", () => {
    it("should find device by custom key", () => {
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "TOTP 1", epoch: 1234567890, id: "device-123" },
        { type: "TOTP", name: "TOTP 2", epoch: 1234567891, id: "device-456" },
      ];
      const session = createSession(devices);
      const found = findDeviceByKey(session, "TOTP", "id", "device-456");
      expect(found).toEqual(devices[1]);
    });
  });
});

describe("Device mutations", () => {
  const createSession = (devices: TwoFactorDevice[]): TwoFactorSessionInfo => ({
    sessionId: "test-session",
    user: "testuser",
    _2fDevices: JSON.stringify(devices),
  });

  describe("addDevice", () => {
    it("should add device to session", () => {
      const session = createSession([]);
      const device: TwoFactorDevice = {
        type: "TOTP",
        name: "My TOTP",
        epoch: 1234567890,
      };
      addDevice(session, device);
      expect(getDevices(session)).toHaveLength(1);
      expect(getDevices(session)[0]).toEqual(device);
    });

    it("should set epoch if not provided", () => {
      const session = createSession([]);
      const device: TwoFactorDevice = {
        type: "TOTP",
        name: "My TOTP",
        epoch: 0,
      };
      const before = Math.floor(Date.now() / 1000);
      addDevice(session, device);
      const after = Math.floor(Date.now() / 1000);
      expect(device.epoch).toBeGreaterThanOrEqual(before);
      expect(device.epoch).toBeLessThanOrEqual(after);
    });

    it("should sanitize device name", () => {
      const session = createSession([]);
      const device: TwoFactorDevice = {
        type: "TOTP",
        name: "<script>alert(1)</script>",
        epoch: 1234567890,
      };
      addDevice(session, device);
      expect(getDevices(session)[0].name).not.toContain("<");
      expect(getDevices(session)[0].name).not.toContain(">");
    });
  });

  describe("removeDevice", () => {
    it("should remove device from session", () => {
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "TOTP 1", epoch: 1234567890 },
        { type: "TOTP", name: "TOTP 2", epoch: 1234567891 },
      ];
      const session = createSession(devices);
      expect(removeDevice(session, "TOTP", 1234567890)).toBe(true);
      expect(getDevices(session)).toHaveLength(1);
      expect(getDevices(session)[0].epoch).toBe(1234567891);
    });

    it("should return false when device not found", () => {
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "TOTP 1", epoch: 1234567890 },
      ];
      const session = createSession(devices);
      expect(removeDevice(session, "TOTP", 9999999999)).toBe(false);
    });
  });

  describe("updateDevice", () => {
    it("should update device properties", () => {
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "TOTP 1", epoch: 1234567890 },
      ];
      const session = createSession(devices);
      expect(
        updateDevice(session, "TOTP", 1234567890, { name: "New Name" }),
      ).toBe(true);
      expect(getDevices(session)[0].name).toBe("New Name");
    });

    it("should return false when device not found", () => {
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "TOTP 1", epoch: 1234567890 },
      ];
      const session = createSession(devices);
      expect(
        updateDevice(session, "TOTP", 9999999999, { name: "New Name" }),
      ).toBe(false);
    });

    it("should sanitize updated name", () => {
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "TOTP 1", epoch: 1234567890 },
      ];
      const session = createSession(devices);
      updateDevice(session, "TOTP", 1234567890, {
        name: '<script>alert("xss")</script>',
      });
      expect(getDevices(session)[0].name).not.toContain("<");
    });
  });

  describe("removeExpiredDevices", () => {
    it("should remove expired devices", () => {
      const now = Math.floor(Date.now() / 1000);
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "Old TOTP", epoch: now - 1000 },
        { type: "TOTP", name: "New TOTP", epoch: now - 100 },
      ];
      const session = createSession(devices);
      const removed = removeExpiredDevices(session, "TOTP", 500);
      expect(removed).toBe(1);
      expect(getDevices(session)).toHaveLength(1);
      expect(getDevices(session)[0].name).toBe("New TOTP");
    });

    it("should return 0 when ttl is 0", () => {
      const now = Math.floor(Date.now() / 1000);
      const devices: TwoFactorDevice[] = [
        { type: "TOTP", name: "TOTP", epoch: now - 10000 },
      ];
      const session = createSession(devices);
      expect(removeExpiredDevices(session, "TOTP", 0)).toBe(0);
      expect(getDevices(session)).toHaveLength(1);
    });
  });
});

describe("Utility functions", () => {
  describe("sanitizeDeviceName", () => {
    it("should remove dangerous characters", () => {
      expect(sanitizeDeviceName('<script>"alert"</script>')).toBe(
        "scriptalert/script",
      );
    });

    it("should trim whitespace", () => {
      expect(sanitizeDeviceName("  My Device  ")).toBe("My Device");
    });

    it("should truncate long names", () => {
      const longName = "a".repeat(100);
      expect(sanitizeDeviceName(longName).length).toBe(MAX_DEVICE_NAME_LENGTH);
    });
  });

  describe("generateDefaultName", () => {
    it("should generate default name without index", () => {
      expect(generateDefaultName("TOTP")).toBe("My TOTP");
    });

    it("should generate default name with index", () => {
      expect(generateDefaultName("TOTP", 2)).toBe("My TOTP 2");
    });

    it("should not add suffix for index 1", () => {
      expect(generateDefaultName("TOTP", 1)).toBe("My TOTP");
    });
  });
});

describe("DeviceRegistry class", () => {
  const createSession = (devices: TwoFactorDevice[]): TwoFactorSessionInfo => ({
    sessionId: "test-session",
    user: "testuser",
    _2fDevices: JSON.stringify(devices),
  });

  it("should provide access to all devices", () => {
    const devices: TwoFactorDevice[] = [
      { type: "TOTP", name: "My TOTP", epoch: 1234567890 },
    ];
    const registry = new DeviceRegistry(createSession(devices));
    expect(registry.devices).toEqual(devices);
  });

  it("should get devices by type", () => {
    const devices: TwoFactorDevice[] = [
      { type: "TOTP", name: "TOTP 1", epoch: 1234567890 },
      { type: "WebAuthn", name: "Key 1", epoch: 1234567891 },
    ];
    const registry = new DeviceRegistry(createSession(devices));
    expect(registry.getByType("TOTP")).toHaveLength(1);
  });

  it("should check if type exists", () => {
    const devices: TwoFactorDevice[] = [
      { type: "TOTP", name: "My TOTP", epoch: 1234567890 },
    ];
    const registry = new DeviceRegistry(createSession(devices));
    expect(registry.hasType("TOTP")).toBe(true);
    expect(registry.hasType("WebAuthn")).toBe(false);
  });

  it("should add and remove devices", () => {
    const session = createSession([]);
    const registry = new DeviceRegistry(session);

    registry.add({ type: "TOTP", name: "New TOTP", epoch: 1234567890 });
    expect(registry.hasAny()).toBe(true);

    registry.remove("TOTP", 1234567890);
    expect(registry.hasAny()).toBe(false);
  });

  it("should serialize to JSON", () => {
    const devices: TwoFactorDevice[] = [
      { type: "TOTP", name: "My TOTP", epoch: 1234567890 },
    ];
    const registry = new DeviceRegistry(createSession(devices));
    expect(registry.toJSON()).toBe(JSON.stringify(devices));
  });
});
