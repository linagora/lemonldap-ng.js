import { vi } from "vitest";

const syslog = require("modern-syslog");

let logSpy, openSpy;

const Logger = require("@lemonldap-ng/logger");
const conf = {
  logLevel: "notice",
  logger: "Lemonldap::NG::Common::Logger::Syslog",
};

beforeEach(() => {
  logSpy = vi.spyOn(syslog, "log");
  openSpy = vi.spyOn(syslog, "open");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("syslog logger", () => {
  it("should apply logLevel", async () => {
    const logger = await Logger(conf, false);
    expect(openSpy).toHaveBeenCalled();
    logger.info("info");
    expect(logSpy).not.toHaveBeenCalledWith("info");
    logger.warn("warn");
    expect(logSpy).toHaveBeenCalledWith("LOG_WARNING", "warn");
  });
});
