/**
 * Tests for the OAuth2 handler (Lemonldap::NG::Handler::Lib::OAuth2 port)
 *
 * The central property checked here is that a Bearer token is only ever a
 * *reference to an access token session*: the token payload is never trusted,
 * and a token that does not resolve to a stored access token session can not
 * be used to reach a user session.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";
import LemonldapNGHandlerOAuth2 from "./handlerOAuth2";

const VHOST = "test1.example.com";
const now = () => Math.round(Date.now() / 1000);

/* Forge an unsigned JWT, as an attacker would */
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const forgeJWT = (jti: string, signature: string = "") =>
  `${b64({ alg: "none", typ: "JWT" })}.${b64({
    jti,
    sub: "attacker",
    exp: 0,
  })}.${signature}`;

type Fixture = {
  dir: string;
  oidcDir: string;
  handler: LemonldapNGHandlerOAuth2;
  app: express.Express;
};

/**
 * Build a temporary LLNG configuration and start an OAuth2-protected app
 * @param dedicatedOidcStorage - store access tokens apart from user sessions
 */
const setup = async (dedicatedOidcStorage: boolean): Promise<Fixture> => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llng-oauth2-"));
  const confDir = path.join(dir, "conf");
  const sessionsDir = path.join(dir, "sessions");
  const oidcDir = dedicatedOidcStorage ? path.join(dir, "oidc") : sessionsDir;
  [confDir, sessionsDir, oidcDir].forEach((d) =>
    fs.mkdirSync(d, { recursive: true }),
  );

  const conf = {
    cfgNum: 1,
    key: "azertyyuio",
    cookieName: "lemonldap",
    portal: "http://auth.example.com/",
    securedCookie: 0,
    timeout: 72000,
    whatToTrace: "_whatToTrace",
    useRedirectOnError: 0,
    globalStorage: "Apache::Session::File",
    globalStorageOptions: { Directory: sessionsDir },
    ...(dedicatedOidcStorage
      ? {
          oidcStorage: "Apache::Session::File",
          oidcStorageOptions: { Directory: oidcDir },
        }
      : {}),
    oidcRPMetaDataOptions: {
      myrp: { oidcRPMetaDataOptionsClientID: "my-client-id" },
    },
    locationRules: {
      [VHOST]: {
        "^/scoped": "$_scope && /read/.test($_scope)",
        default: "accept",
      },
    },
    exportedHeaders: {
      [VHOST]: {
        "Auth-User": "$uid",
        "Auth-Client": "$_clientId",
        "Auth-Scope": "$_scope",
      },
    },
    exportedVars: {},
    groups: {},
    sessionDataToRemember: {},
  };
  fs.writeFileSync(
    path.join(confDir, "lmConf-1.json"),
    JSON.stringify(conf, null, 1),
  );

  fs.writeFileSync(
    path.join(dir, "lemonldap-ng.ini"),
    [
      "[all]",
      "logLevel = error",
      "logger = Lemonldap::NG::Common::Logger::Std",
      "userLogger = Lemonldap::NG::Common::Logger::Std",
      "",
      "[configuration]",
      "type=File",
      `dirName=${confDir}`,
      "",
      "[node-handler]",
      `nodeVhosts = ${VHOST}`,
      "",
    ].join("\n"),
  );

  const writeSession = (d: string, id: string, data: object) =>
    fs.writeFileSync(
      path.join(d, id),
      JSON.stringify({ _session_id: id, _utime: now(), ...data }),
    );

  /* User sessions */
  writeSession(sessionsDir, "usersession1", {
    _whatToTrace: "dwho",
    _session_kind: "SSO",
    uid: "dwho",
  });

  /* Offline session, stored with the access tokens */
  writeSession(oidcDir, "offlinesession1", {
    _whatToTrace: "rtyler",
    _session_kind: "OIDCI",
    uid: "rtyler",
  });

  /* Access token sessions */
  writeSession(oidcDir, "at1", {
    _session_kind: "OIDCI",
    rp: "myrp",
    scope: "openid read",
    grant_type: "authorizationcode",
    aud: "my-client-id",
    user_session_id: "usersession1",
  });
  writeSession(oidcDir, "at2", {
    _session_kind: "OIDCI",
    rp: "myrp",
    scope: "openid write",
    user_session_id: "usersession1",
  });
  writeSession(oidcDir, "atoffline", {
    _session_kind: "OIDCI",
    rp: "myrp",
    scope: "openid offline_access",
    offline_session_id: "offlinesession1",
  });
  writeSession(oidcDir, "atexpired", {
    _session_kind: "OIDCI",
    rp: "myrp",
    user_session_id: "usersession1",
  });
  /* Rewrite the expired one with an outdated _utime */
  fs.writeFileSync(
    path.join(oidcDir, "atexpired"),
    JSON.stringify({
      _session_id: "atexpired",
      _utime: now() - 100000,
      rp: "myrp",
      user_session_id: "usersession1",
    }),
  );
  /* Access token referencing nothing */
  writeSession(oidcDir, "atempty", { _session_kind: "OIDCI", rp: "myrp" });
  /* Access token whose user session is gone (revoked, expired, purged) */
  writeSession(oidcDir, "atorphan", {
    _session_kind: "OIDCI",
    rp: "myrp",
    scope: "openid read",
    user_session_id: "nosuchusersession",
  });
  /* Same, for an offline session */
  writeSession(oidcDir, "atorphanoffline", {
    _session_kind: "OIDCI",
    rp: "myrp",
    scope: "openid offline_access",
    offline_session_id: "nosuchofflinesession",
  });
  /* Access token session holding a session id the store must never see */
  writeSession(oidcDir, "atbadref", {
    _session_kind: "OIDCI",
    rp: "myrp",
    user_session_id: "usersession1,ou=admins,dc=example,dc=com",
  });
  /* Access token session with an unusable _utime */
  writeSession(oidcDir, "atbadutime", {
    _session_kind: "OIDCI",
    _utime: "not-a-number",
    rp: "myrp",
    user_session_id: "usersession1",
  });
  /* Access token used by the revocation test, which deletes it */
  writeSession(oidcDir, "atrevoke", {
    _session_kind: "OIDCI",
    rp: "myrp",
    scope: "openid read",
    user_session_id: "usersession1",
  });

  const handler = new LemonldapNGHandlerOAuth2({
    configStorage: { confFile: path.join(dir, "lemonldap-ng.ini") },
  });
  await handler.init();

  const app = express();
  app.use((req, res, next) => handler.run(req, res, next));
  app.get("/", (_req, res) => {
    res.status(200).send("Hello World!");
  });
  app.get("/scoped", (_req, res) => {
    res.status(200).send("Scoped resource");
  });
  app.get("/headers", (req, res) => {
    res.status(200).json(req.headers);
  });

  return { dir, oidcDir, handler, app };
};

describe("OAuth2 handler, dedicated OIDC storage", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await setup(true);
  });

  afterAll(async () => {
    await f.handler.stopEventLoop();
    fs.rmSync(f.dir, { recursive: true, force: true });
  });

  const get = (url: string) => request(f.app).get(url).set("Host", VHOST);

  describe("Access token resolution", () => {
    it("accepts an opaque access token and forges the user headers", async () => {
      const res = await get("/headers").set("Authorization", "Bearer at1");
      expect(res.status).toBe(200);
      expect(res.body["Auth-User"]).toBe("dwho");
      expect(res.body["Lm-Remote-User"]).toBe("dwho");
    });

    it("accepts the JWT serialization of an access token", async () => {
      const res = await get("/headers").set(
        "Authorization",
        `Bearer ${forgeJWT("at1")}`,
      );
      expect(res.status).toBe(200);
      expect(res.body["Auth-User"]).toBe("dwho");
    });

    it("follows an offline access token to its offline session", async () => {
      const res = await get("/headers").set(
        "Authorization",
        "Bearer atoffline",
      );
      expect(res.status).toBe(200);
      expect(res.body["Auth-User"]).toBe("rtyler");
    });

    it("still accepts cookie authentication", async () => {
      const res = await get("/").set("Cookie", "lemonldap=usersession1");
      expect(res.status).toBe(200);
    });
  });

  describe("Forged tokens (GHSA-jj3p-7p8x-j82f)", () => {
    it("rejects an unsigned JWT whose jti is a real user session id", async () => {
      const res = await get("/headers").set(
        "Authorization",
        `Bearer ${forgeJWT("usersession1")}`,
      );
      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toBe(
        'Bearer error="invalid_token"',
      );
      expect(res.body["Auth-User"]).toBeUndefined();
    });

    it("rejects it whatever the signature segment contains", async () => {
      const res = await get("/headers").set(
        "Authorization",
        `Bearer ${forgeJWT("usersession1", "NOT_A_VALID_SIGNATURE")}`,
      );
      expect(res.status).toBe(401);
    });

    it("rejects a raw user session id used as a Bearer token", async () => {
      const res = await get("/headers").set(
        "Authorization",
        "Bearer usersession1",
      );
      expect(res.status).toBe(401);
    });

    it("rejects an unknown access token", async () => {
      const res = await get("/").set(
        "Authorization",
        `Bearer ${forgeJWT("doesnotexist")}`,
      );
      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toBe(
        'Bearer error="invalid_token"',
      );
    });

    it("rejects an expired access token session", async () => {
      const res = await get("/").set("Authorization", "Bearer atexpired");
      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toBe(
        'Bearer error="invalid_token"',
      );
    });

    it("rejects an access token referencing no session", async () => {
      const res = await get("/").set("Authorization", "Bearer atempty");
      expect(res.status).toBe(401);
    });

    it("rejects an empty Bearer token", async () => {
      const res = await get("/").set("Authorization", "Bearer    ");
      expect(res.status).toBe(401);
    });

    it("falls back to the cookie when the Bearer token is empty", async () => {
      /* HTTP strips the trailing spaces of a header, so an empty Bearer
         token can only be built by calling fetchId() directly */
      const id = await f.handler.fetchId(<express.Request>(<unknown>{
        headers: {
          authorization: "Bearer ",
          cookie: "lemonldap=usersession1",
        },
      }));
      expect(id).toBe("usersession1");
    });

    it("rejects a jti that is not shaped like a session id", async () => {
      /* LDAP DN and URL path injections, refused before the store is hit.
         A valid cookie is joined to check that the malformed token is a hard
         failure, and not just a lookup that finds nothing */
      for (const jti of [
        "at1,ou=admins,dc=example,dc=com",
        "../../usersession1",
        "at1)(objectClass=*",
        "at 1",
      ]) {
        const res = await get("/headers")
          .set("Authorization", `Bearer ${forgeJWT(jti)}`)
          .set("Cookie", "lemonldap=usersession1");
        expect(res.status).toBe(401);
        expect(res.headers["www-authenticate"]).toBe(
          'Bearer error="invalid_token"',
        );
      }
    });

    it("rejects a jti that is not a string", async () => {
      const jwt = `${b64({ alg: "none", typ: "JWT" })}.${b64({
        jti: ["at1"],
      })}.`;
      const res = await get("/headers").set("Authorization", `Bearer ${jwt}`);
      expect(res.status).toBe(401);
    });

    it("falls back to the cookie when the token is unknown", async () => {
      const res = await get("/")
        .set("Authorization", "Bearer doesnotexist")
        .set("Cookie", "lemonldap=usersession1");
      expect(res.status).toBe(200);
    });
  });

  describe("Broken session references", () => {
    /* A token that resolved to an access token session has authenticated the
       request: what it points to must then be reachable, or the request
       fails. Falling back to the cookie here would let a revoked token
       downgrade to another identity instead of being reported to the client */

    it("rejects a token whose user session is gone", async () => {
      const res = await get("/headers").set("Authorization", "Bearer atorphan");
      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toBe(
        'Bearer error="invalid_token"',
      );
    });

    it("does not fall back to the cookie when the user session is gone", async () => {
      const res = await get("/headers")
        .set("Authorization", "Bearer atorphan")
        .set("Cookie", "lemonldap=usersession1");
      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toBe(
        'Bearer error="invalid_token"',
      );
      expect(res.body["Auth-User"]).toBeUndefined();
    });

    it("rejects a token whose offline session is gone", async () => {
      const res = await get("/headers")
        .set("Authorization", "Bearer atorphanoffline")
        .set("Cookie", "lemonldap=usersession1");
      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toBe(
        'Bearer error="invalid_token"',
      );
      expect(res.body["Auth-User"]).toBeUndefined();
    });

    it("rejects an expired access token session even with a valid cookie", async () => {
      const res = await get("/headers")
        .set("Authorization", "Bearer atexpired")
        .set("Cookie", "lemonldap=usersession1");
      expect(res.status).toBe(401);
      expect(res.body["Auth-User"]).toBeUndefined();
    });

    it("rejects a token session holding a malformed session id", async () => {
      /* The ids read from the access token session are written by the Portal,
         but they reach the store just like the token does: the File backend
         refuses them, session-ldap would interpolate them in a DN. fetchId()
         must not hand them over in the first place */
      const id = await f.handler.fetchId(<express.Request>(<unknown>{
        headers: { authorization: "Bearer atbadref" },
      }));
      expect(id).toBe("");

      const res = await get("/headers")
        .set("Authorization", "Bearer atbadref")
        .set("Cookie", "lemonldap=usersession1");
      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toBe(
        'Bearer error="invalid_token"',
      );
    });

    it("rejects a token session whose _utime is not a number", async () => {
      /* `now - "not-a-number" > timeout` is false: an unchecked _utime grants
         an unlimited lifetime */
      const res = await get("/headers").set(
        "Authorization",
        "Bearer atbadutime",
      );
      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toBe(
        'Bearer error="invalid_token"',
      );
    });
  });

  describe("Token revocation", () => {
    it("stops honouring a token once localUnlog() has been broadcast", async () => {
      const before = await get("/headers").set(
        "Authorization",
        "Bearer atrevoke",
      );
      expect(before.status).toBe(200);
      expect(before.body["Auth-User"]).toBe("dwho");

      /* The Portal deletes the access token session... */
      fs.rmSync(path.join(f.oidcDir, "atrevoke"));

      /* ...which the OIDC accessor caches for two minutes */
      const cached = await get("/").set("Authorization", "Bearer atrevoke");
      expect(cached.status).toBe(200);

      /* ...and announces it through the message broker */
      await f.handler.localUnlog("atrevoke");

      const after = await get("/").set("Authorization", "Bearer atrevoke");
      expect(after.status).toBe(401);
      expect(after.headers["www-authenticate"]).toBe(
        'Bearer error="invalid_token"',
      );
    });
  });

  describe("Resource server behaviour (RFC 6750)", () => {
    it("answers 401 with a Bearer challenge instead of redirecting", async () => {
      const res = await get("/");
      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toBe("Bearer");
      expect(res.headers.location).toBeUndefined();
    });

    it("hides the access token from the protected application", async () => {
      const res = await get("/headers").set("Authorization", "Bearer at1");
      expect(res.status).toBe(200);
      expect(res.body.authorization).toBeUndefined();
    });

    it("hides the LLNG cookie from the protected application", async () => {
      const res = await get("/headers").set(
        "Cookie",
        "lemonldap=usersession1; other=1",
      );
      expect(res.status).toBe(200);
      expect(res.body.cookie).not.toMatch(/lemonldap=/);
    });
  });

  describe("Token attributes", () => {
    it("exposes scope and client id to headers", async () => {
      const res = await get("/headers").set("Authorization", "Bearer at1");
      expect(res.body["Auth-Scope"]).toBe("openid read");
      expect(res.body["Auth-Client"]).toBe("my-client-id");
    });

    it("does not leak token attributes between requests", async () => {
      const first = await get("/headers").set("Authorization", "Bearer at1");
      const second = await get("/headers").set("Authorization", "Bearer at2");
      expect(first.body["Auth-Scope"]).toBe("openid read");
      expect(second.body["Auth-Scope"]).toBe("openid write");
    });

    it("does not expose token attributes to cookie authentication", async () => {
      const res = await get("/headers").set("Cookie", "lemonldap=usersession1");
      expect(res.body["Auth-Scope"]).toBeUndefined();
    });

    it("does not lend the attributes of a token that grants no session", async () => {
      /* atempty holds a scope but references no session: the request is
         authenticated by the cookie, which must not inherit that scope */
      const res = await get("/headers")
        .set("Authorization", "Bearer atempty")
        .set("Cookie", "lemonldap=usersession1");
      expect(res.status).toBe(200);
      expect(res.body["Auth-User"]).toBe("dwho");
      expect(res.body["Auth-Scope"]).toBeUndefined();
      expect(res.body["Auth-Client"]).toBeUndefined();
    });

    it("allows scope based access rules", async () => {
      const granted = await get("/scoped").set("Authorization", "Bearer at1");
      expect(granted.status).toBe(200);
      const denied = await get("/scoped").set("Authorization", "Bearer at2");
      expect(denied.status).toBe(403);
    });
  });
});

describe("OAuth2 handler, storage shared with user sessions", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await setup(false);
  });

  afterAll(async () => {
    await f.handler.stopEventLoop();
    fs.rmSync(f.dir, { recursive: true, force: true });
  });

  const get = (url: string) => request(f.app).get(url).set("Host", VHOST);

  it("accepts a genuine access token", async () => {
    const res = await get("/headers").set("Authorization", "Bearer at1");
    expect(res.status).toBe(200);
    expect(res.body["Auth-User"]).toBe("dwho");
  });

  it("rejects a user session id presented as an access token", async () => {
    const res = await get("/headers").set(
      "Authorization",
      `Bearer ${forgeJWT("usersession1")}`,
    );
    expect(res.status).toBe(401);
    expect(res.body["Auth-User"]).toBeUndefined();
  });
});

describe("OAuth2 handler, configuration reload", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await setup(true);
  });

  afterAll(async () => {
    await f.handler.stopEventLoop();
    fs.rmSync(f.dir, { recursive: true, force: true });
  });

  const get = (url: string) => request(f.app).get(url).set("Host", VHOST);

  it("rebuilds the OIDC accessor when oidcStorage changes", async () => {
    const before = await get("/headers").set("Authorization", "Bearer at1");
    expect(before.body["Auth-User"]).toBe("dwho");

    /* New OIDC storage, where at1 is bound to another user */
    const newOidcDir = path.join(f.dir, "oidc2");
    fs.mkdirSync(newOidcDir, { recursive: true });
    fs.writeFileSync(
      path.join(newOidcDir, "at1"),
      JSON.stringify({
        _session_id: "at1",
        _utime: now(),
        _session_kind: "OIDCI",
        rp: "myrp",
        scope: "openid read",
        user_session_id: "usersession2",
      }),
    );
    fs.writeFileSync(
      path.join(f.dir, "sessions", "usersession2"),
      JSON.stringify({
        _session_id: "usersession2",
        _utime: now(),
        _whatToTrace: "rtyler",
        _session_kind: "SSO",
        uid: "rtyler",
      }),
    );

    const confDir = path.join(f.dir, "conf");
    const conf = JSON.parse(
      fs.readFileSync(path.join(confDir, "lmConf-1.json")).toString(),
    );
    conf.cfgNum = 2;
    conf.oidcStorageOptions = { Directory: newOidcDir };
    fs.writeFileSync(
      path.join(confDir, "lmConf-2.json"),
      JSON.stringify(conf, null, 1),
    );

    await f.handler.reload();

    const after = await get("/headers").set("Authorization", "Bearer at1");
    expect(after.status).toBe(200);
    expect(after.body["Auth-User"]).toBe("rtyler");
  });

  it("keeps the previous OIDC storage when the new one is unusable", async () => {
    /* A configuration announcing a broken oidcStorage must not leave the
       handler with a dead accessor, which would 401 every token */
    const confDir = path.join(f.dir, "conf");
    const conf = JSON.parse(
      fs.readFileSync(path.join(confDir, "lmConf-2.json")).toString(),
    );
    conf.cfgNum = 3;
    conf.oidcStorageOptions = { Directory: path.join(f.dir, "doesnotexist") };
    fs.writeFileSync(
      path.join(confDir, "lmConf-3.json"),
      JSON.stringify(conf, null, 1),
    );

    await expect(f.handler.reload()).rejects.toBeDefined();

    /* Still served by the accessor built by the previous reload */
    const res = await get("/headers").set("Authorization", "Bearer at1");
    expect(res.status).toBe(200);
    expect(res.body["Auth-User"]).toBe("rtyler");
  });
});
