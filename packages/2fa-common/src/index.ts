/**
 * @lemonldap-ng/2fa-common
 *
 * Common 2FA interfaces, types, and device registry for LemonLDAP::NG
 *
 * @packageDocumentation
 */

// Export all types
export * from "./types";

// Export device registry
export {
  MAX_DEVICE_NAME_LENGTH,
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
} from "./devices";

// Export base classes
export {
  BaseSecondFactor,
  BaseSecondFactorRegister,
  InMemoryTokenManager,
  type OneTimeTokenManager,
} from "./base";
