const request = require("supertest");
const path = require("path");
const fs = require("fs");
const ini = require("ini");
const SafeLib = require("@lemonldap-ng/safelib");
const Crypto = require("@lemonldap-ng/crypto");
const handler = require("../lib");

const iniSrc = path.join(__dirname, "__testData__", "lemonldap-ng.ini");
const iniTmp = path.join(__dirname, "__testData__", "lemonldap-ng.tmp.ini");
const lmconfSrc = path.join(__dirname, "__testData__", "conf-1.json");
const lmconfTmp = path.join(__dirname, "__testData__", "lmConf-1.json");
const sessionsDir = path.join(__dirname, "__testData__", "sessions");
const sessionSrc = path.join(__dirname, "__testData__", "session.json");

const crypto = new Crypto("azertyyuio");

const cipher = new SafeLib({
  cipher: crypto,
});

let app;

beforeAll(() => {
  // build lemonldap-ng.ini
  let content = ini.parse(fs.readFileSync(iniSrc, "utf-8"));
  content.configuration.dirName = path.join(__dirname, "__testData__");
  fs.writeFileSync(iniTmp, ini.stringify(content));

  // build lmConf-1.json
  content = fs
    .readFileSync(lmconfSrc, "utf-8")
    .replace(/__SESSIONDIR__/g, sessionsDir);
  fs.writeFileSync(lmconfTmp, content);

  // build sessions
  fs.mkdirSync(sessionsDir);
  const date = cipher.date();
  const perlTimestamp = Math.round(Date.now() / 1000).toString();
  content = JSON.parse(fs.readFileSync(sessionSrc, "utf-8"));
  ["_lastAuthnUTime", "_utime"].forEach((k) => {
    content[k] = perlTimestamp;
  });
  ["_updateTime", "_startTime"].forEach((k) => {
    content[k] = date;
  });
  fs.writeFileSync(
    path.join(sessionsDir, "dwhosession"),
    JSON.stringify(content),
  );
  content.uid = "rtyler";
  fs.writeFileSync(
    path.join(sessionsDir, "rtylersession"),
    JSON.stringify(content),
  );
});

let warnSpy, errorSpy;
beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn");
  errorSpy = vi.spyOn(console, "error");
});

afterAll(async () => {
  // Stop the event loop and close session to allow the test runner to exit
  await handler.shutdown();
  fs.rmSync(iniTmp);
  fs.rmSync(lmconfTmp);
  fs.rmSync(sessionsDir, {
    recursive: true,
  });
});

describe("Main", () => {
  beforeAll(async () => {
    // load express app
    const mod = await import("./__testData__/express-app.js");
    app = await mod.default;
  });
  test("It should redirect unauthentified requests", async () => {
    const response = await request(app).get("/");
    expect(response.status).toEqual(302);
    expect(response.headers.location).toMatch(
      new RegExp("^http://auth\\.example\\.com/\\?url="),
    );
  });

  test("It should redirect unexistent sessions", async () => {
    const res = await agent("bar", "/deny").expect(302);
    expect(res.headers.location).toMatch(
      new RegExp("^http://auth\\.example\\.com/\\?url="),
    );
  });

  test("It should accept authentified requests", async () => {
    const res = await agent().expect(200);
    expect(res.text).toEqual("Hello World!");
  });

  test("It should reject /deny", async () => {
    await agent("dwho", "/deny").expect(403);
  });

  test("It should accept /dwho for dwho", async () => {
    await agent("dwho", "/dwho").expect(200);
  });

  test("It should deny /dwho for rtyler", async () => {
    await agent("rtyler", "/dwho").expect(403);
  });

  test("It should send headers and remove cookie", async () => {
    const res = await agent("dwho", "/headers").expect(200);
    let headers = JSON.parse(res.text);
    expect(headers["Auth-User"]).toEqual("dwho");
    expect(headers["cookie"]).toEqual("");
  });

  it("Should return an error if host isn't configured", async () => {
    await agent("dwho", "/", "test3.example.com").expect(503);
  });
});

describe("handlerServiceToken", () => {
  beforeEach(async () => {
    app = await require("./__testData__/express-app-st.js");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should works with user", async () => {
    const res = await agent("dwho", "/headers").expect(200);
    let headers = JSON.parse(res.text);
    expect(headers["Auth-User"]).toEqual("dwho");
    expect(headers["cookie"]).toEqual("");
  });

  it("should accept valid token", async () => {
    const res = await agentSt(
      cipher.token("dwhosession", "test1.example.com"),
      "/headers",
    ).expect(200);
    let headers = JSON.parse(res.text);
    expect(headers["Auth-User"]).toEqual("dwho");
  });

  describe("errors", () => {
    it("should reject invalid token", async () => {
      const res = await agentSt(
        [
          parseInt(Math.trunc(Date.now() / 1000)),
          "dwhosession",
          "test1.example.com",
        ].join(":"),
        "/headers",
      ).expect(302);
      expect(res.headers.location).toMatch(
        new RegExp("^http://auth\\.example\\.com/\\?url="),
      );
      expect(errorSpy).toHaveBeenCalledWith("Invalid token");
    });

    it("should reject expired token", async () => {
      const res = await agentSt(
        crypto.encrypt(
          [
            parseInt(Math.trunc(Date.now() / 1000) - 31),
            "dwhosession",
            "test1.example.com",
          ].join(":"),
        ),
        "/headers",
      ).expect(302);
      expect(res.headers.location).toMatch(
        new RegExp("^http://auth\\.example\\.com/\\?url="),
      );
      expect(warnSpy).toHaveBeenCalledWith("Expired service token");
    });
  });
});

const agent = (id = "dwho", path = "/", host = "test1.example.com") => {
  return request
    .agent(app)
    .host(host)
    .get(path)
    .set("Cookie", [`lemonldap=${id}session`])
    .send();
};

const agentSt = (token, path = "/", host = "test1.example.com") => {
  return request
    .agent(app)
    .host(host)
    .get(path)
    .set({
      "X-Llng-Token": token,
    })
    .send();
};
