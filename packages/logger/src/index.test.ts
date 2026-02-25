import { vi } from "vitest";

const Logger = require("..");
const conf = {
  logLevel: "debug",
  logger: "Lemonldap::NG::Common::Logger::Std",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("Standard logger", () => {
  let spies;

  beforeEach(() => {
    spies = {
      debug: vi.spyOn(console, "debug"),
      info: vi.spyOn(console, "log"),
      warn: vi.spyOn(console, "warn"),
      error: vi.spyOn(console, "error"),
    };
    spies.notice = spies.warn;
  });

  it("should display all levels", async () => {
    const logger = await Logger(conf, false);
    const tested = ["debug", "info", "notice", "error"];
    tested.forEach((level) => {
      logger[level](level);
      expect(spies[level]).toHaveBeenCalledWith(level);
    });
  });

  it("should apply logLevel", async () => {
    conf.logLevel = "notice";
    const logger = await Logger(conf, false);
    logger.warn("warn");
    expect(spies.warn).toHaveBeenCalledWith("warn");
    logger.info("info");
    expect(spies.info).not.toHaveBeenCalledWith("info");
  });
});

global.uwsgi = {
  log: console.log,
};

describe("uWsgi logger as userLogger", () => {
  let uwsgiSpy;

  beforeEach(() => {
    uwsgiSpy = vi.spyOn(uwsgi, "log");

    conf.logLevel = "notice";
    conf.userLogger = "Lemonldap::NG::Common::Logger::UWSGI";
  });

  it("should display level in text", async () => {
    const logger = await Logger(conf, true);
    logger.warn("user warn");
    expect(uwsgiSpy).toHaveBeenCalledWith("[warn] user warn");
  });
});
