/**
 * @lemonldap-ng/2fa-common - Device Registry
 *
 * Device storage and management for 2FA
 * Equivalent to Perl Lemonldap::NG::Portal::Lib::2fDevices
 *
 * @packageDocumentation
 */

import type {
  TwoFactorDevice,
  SecondFactorType,
  TwoFactorSessionInfo,
} from "./types";

/**
 * Maximum device name length
 */
export const MAX_DEVICE_NAME_LENGTH = 64;

/**
 * Parse _2fDevices JSON from session
 * @param devicesJson JSON string from session._2fDevices
 * @returns Array of devices or empty array
 */
export function parseDevices(devicesJson?: string): TwoFactorDevice[] {
  if (!devicesJson) return [];

  try {
    const devices = JSON.parse(devicesJson);
    if (!Array.isArray(devices)) {
      console.warn("2fDevices is not an array, resetting");
      return [];
    }
    return devices;
  } catch (e) {
    console.warn("Failed to parse _2fDevices JSON:", e);
    return [];
  }
}

/**
 * Serialize devices to JSON for session storage
 * @param devices Array of devices
 * @returns JSON string
 */
export function serializeDevices(devices: TwoFactorDevice[]): string {
  return JSON.stringify(devices);
}

/**
 * Get all 2FA devices from session
 * @param session Session info
 * @returns Array of devices
 */
export function getDevices(session: TwoFactorSessionInfo): TwoFactorDevice[] {
  return parseDevices(session._2fDevices);
}

/**
 * Get devices of a specific type
 * @param session Session info
 * @param type Device type to filter
 * @returns Filtered devices
 */
export function getDevicesByType(
  session: TwoFactorSessionInfo,
  type: SecondFactorType,
): TwoFactorDevice[] {
  return getDevices(session).filter((d) => d.type === type);
}

/**
 * Check if user has any device of specified type
 * @param session Session info
 * @param type Device type
 * @returns True if user has at least one device of this type
 */
export function hasDeviceOfType(
  session: TwoFactorSessionInfo,
  type: SecondFactorType,
): boolean {
  return getDevicesByType(session, type).length > 0;
}

/**
 * Check if user has any 2FA device registered
 * @param session Session info
 * @returns True if user has at least one 2FA device
 */
export function hasAnyDevice(session: TwoFactorSessionInfo): boolean {
  return getDevices(session).length > 0;
}

/**
 * Find device by type and epoch
 * @param session Session info
 * @param type Device type
 * @param epoch Registration timestamp
 * @returns Found device or undefined
 */
export function findDevice(
  session: TwoFactorSessionInfo,
  type: SecondFactorType,
  epoch: number,
): TwoFactorDevice | undefined {
  return getDevices(session).find((d) => d.type === type && d.epoch === epoch);
}

/**
 * Find device by key/value match
 * @param session Session info
 * @param type Device type
 * @param key Property key to match
 * @param value Value to match
 * @returns Found device or undefined
 */
export function findDeviceByKey(
  session: TwoFactorSessionInfo,
  type: SecondFactorType,
  key: string,
  value: unknown,
): TwoFactorDevice | undefined {
  return getDevices(session).find((d) => d.type === type && d[key] === value);
}

/**
 * Add a new device to session
 * @param session Session info (will be modified)
 * @param device Device to add
 * @returns Updated devices JSON string
 */
export function addDevice(
  session: TwoFactorSessionInfo,
  device: TwoFactorDevice,
): string {
  const devices = getDevices(session);

  // Ensure epoch is set
  if (!device.epoch) {
    device.epoch = Math.floor(Date.now() / 1000);
  }

  // Sanitize device name
  if (device.name) {
    device.name = sanitizeDeviceName(device.name);
  }

  devices.push(device);
  session._2fDevices = serializeDevices(devices);
  return session._2fDevices;
}

/**
 * Remove a device from session
 * @param session Session info (will be modified)
 * @param type Device type
 * @param epoch Registration timestamp
 * @returns True if device was removed
 */
export function removeDevice(
  session: TwoFactorSessionInfo,
  type: SecondFactorType,
  epoch: number,
): boolean {
  const devices = getDevices(session);
  const initialLength = devices.length;

  const filtered = devices.filter(
    (d) => !(d.type === type && d.epoch === epoch),
  );

  if (filtered.length === initialLength) {
    return false;
  }

  session._2fDevices = serializeDevices(filtered);
  return true;
}

/**
 * Update a device property
 * @param session Session info (will be modified)
 * @param type Device type
 * @param epoch Registration timestamp
 * @param updates Properties to update
 * @returns True if device was updated
 */
export function updateDevice(
  session: TwoFactorSessionInfo,
  type: SecondFactorType,
  epoch: number,
  updates: Partial<TwoFactorDevice>,
): boolean {
  const devices = getDevices(session);
  const device = devices.find((d) => d.type === type && d.epoch === epoch);

  if (!device) {
    return false;
  }

  // Apply updates (sanitize name if provided)
  if (updates.name) {
    updates.name = sanitizeDeviceName(updates.name);
  }

  Object.assign(device, updates);
  session._2fDevices = serializeDevices(devices);
  return true;
}

/**
 * Remove expired devices based on TTL
 * @param session Session info (will be modified)
 * @param type Device type
 * @param ttl TTL in seconds
 * @returns Number of devices removed
 */
export function removeExpiredDevices(
  session: TwoFactorSessionInfo,
  type: SecondFactorType,
  ttl: number,
): number {
  if (ttl <= 0) return 0;

  const devices = getDevices(session);
  const now = Math.floor(Date.now() / 1000);
  const initialLength = devices.length;

  const filtered = devices.filter(
    (d) => !(d.type === type && now - d.epoch > ttl),
  );

  if (filtered.length === initialLength) {
    return 0;
  }

  session._2fDevices = serializeDevices(filtered);
  return initialLength - filtered.length;
}

/**
 * Sanitize device name
 * @param name Device name
 * @returns Sanitized name
 */
export function sanitizeDeviceName(name: string): string {
  // Remove potentially dangerous characters
  let sanitized = name.replace(/[<>&"']/g, "");

  // Trim to max length
  if (sanitized.length > MAX_DEVICE_NAME_LENGTH) {
    sanitized = sanitized.substring(0, MAX_DEVICE_NAME_LENGTH);
  }

  return sanitized.trim();
}

/**
 * Generate default device name
 * @param type Device type
 * @param index Optional index for multiple devices
 * @returns Default name
 */
export function generateDefaultName(
  type: SecondFactorType,
  index?: number,
): string {
  const suffix = index && index > 1 ? ` ${index}` : "";
  return `My ${type}${suffix}`;
}

/**
 * Device registry class for managing 2FA devices
 */
export class DeviceRegistry {
  private session: TwoFactorSessionInfo;

  constructor(session: TwoFactorSessionInfo) {
    this.session = session;
  }

  get devices(): TwoFactorDevice[] {
    return getDevices(this.session);
  }

  getByType(type: SecondFactorType): TwoFactorDevice[] {
    return getDevicesByType(this.session, type);
  }

  hasType(type: SecondFactorType): boolean {
    return hasDeviceOfType(this.session, type);
  }

  hasAny(): boolean {
    return hasAnyDevice(this.session);
  }

  find(type: SecondFactorType, epoch: number): TwoFactorDevice | undefined {
    return findDevice(this.session, type, epoch);
  }

  findByKey(
    type: SecondFactorType,
    key: string,
    value: unknown,
  ): TwoFactorDevice | undefined {
    return findDeviceByKey(this.session, type, key, value);
  }

  add(device: TwoFactorDevice): string {
    return addDevice(this.session, device);
  }

  remove(type: SecondFactorType, epoch: number): boolean {
    return removeDevice(this.session, type, epoch);
  }

  update(
    type: SecondFactorType,
    epoch: number,
    updates: Partial<TwoFactorDevice>,
  ): boolean {
    return updateDevice(this.session, type, epoch, updates);
  }

  removeExpired(type: SecondFactorType, ttl: number): number {
    return removeExpiredDevices(this.session, type, ttl);
  }

  /**
   * Get the current devices JSON string for session update
   */
  toJSON(): string {
    return this.session._2fDevices || "[]";
  }
}
