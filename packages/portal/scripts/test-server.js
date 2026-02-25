#!/usr/bin/env node

/**
 * Test server for LemonLDAP::NG Portal
 * Used by the Perl test harness (t/test-lib.pm)
 *
 * This script uses the real Portal implementation for testing.
 *
 * Usage:
 *   node scripts/test-server.js --port=19876 --tmpdir=/path/to/sessions
 *
 * Environment variables:
 *   LLNG_TMPDIR - Directory for sessions and config
 *   LLNG_PORT - Server port
 *   LLNG_LOGLEVEL - Log level (debug, info, warn, error)
 */

const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    port: parseInt(process.env.LLNG_PORT) || 19876,
    tmpDir: process.env.LLNG_TMPDIR || "/tmp",
    logLevel: process.env.LLNG_LOGLEVEL || "warn",
  };

  for (const arg of args) {
    if (arg.startsWith("--port=")) {
      options.port = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--tmpdir=")) {
      options.tmpDir = arg.split("=")[1];
    } else if (arg.startsWith("--loglevel=")) {
      options.logLevel = arg.split("=")[1];
    }
  }

  return options;
}

function log(level, message, options) {
  const levels = ["debug", "info", "warn", "error"];
  const currentLevel = levels.indexOf(options.logLevel);
  const msgLevel = levels.indexOf(level);
  if (msgLevel >= currentLevel) {
    console.log(`[${level.toUpperCase()}] ${message}`);
  }
}

async function main() {
  const options = parseArgs();

  log("info", `Starting test server on port ${options.port}`, options);
  log("info", `Using tmpDir: ${options.tmpDir}`, options);

  // Try to use the real Portal
  let portal = null;
  let useRealPortal = false;

  try {
    const { init, middleware } = require("../lib/index.cjs");

    // Check if config exists
    const configFile = path.join(options.tmpDir, "lmConf-1.json");
    if (fs.existsSync(configFile)) {
      log("info", "Initializing real Portal...", options);

      portal = await init({
        configStorage: {
          type: "File",
          dirName: options.tmpDir,
        },
        viewsPath: path.join(__dirname, "../lib/templates/views"),
      });

      useRealPortal = true;
      log("info", "Real Portal initialized successfully", options);
    } else {
      log("warn", `Config not found at ${configFile}, using fallback mode`, options);
    }
  } catch (e) {
    log("warn", `Failed to initialize Portal: ${e.message}`, options);
    log("info", "Falling back to simplified mode", options);
  }

  const app = express();

  // Health check endpoint (before other middleware)
  app.get("/health", (req, res) => {
    res.json({ status: "ok", tmpDir: options.tmpDir, realPortal: useRealPortal });
  });

  // Serve static files (languages, icons, js)
  const staticPath = path.join(__dirname, "../lib/static");
  if (fs.existsSync(staticPath)) {
    app.use("/static", express.static(staticPath));
    log("info", `Serving static files from ${staticPath}`, options);
  } else {
    // Try src/static in development
    const srcStaticPath = path.join(__dirname, "../src/static");
    if (fs.existsSync(srcStaticPath)) {
      app.use("/static", express.static(srcStaticPath));
      log("info", `Serving static files from ${srcStaticPath}`, options);
    }
  }

  if (useRealPortal) {
    // Use real Portal middleware
    const { middleware } = require("../lib/index.cjs");
    app.use(middleware(portal));

    log("info", "Using real Portal middleware", options);
  } else {
    // Fallback to simplified implementation
    setupFallbackServer(app, options);
  }

  // Start server
  const server = app.listen(options.port, () => {
    log("info", `Test server listening on port ${options.port}`, options);
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    log("info", "Received SIGTERM, shutting down...", options);
    if (portal && portal.close) {
      await portal.close();
    }
    server.close(() => {
      process.exit(0);
    });
  });

  process.on("SIGINT", async () => {
    log("info", "Received SIGINT, shutting down...", options);
    if (portal && portal.close) {
      await portal.close();
    }
    server.close(() => {
      process.exit(0);
    });
  });
}

/**
 * Fallback server when Portal can't be initialized
 * (e.g., missing dependencies or invalid config)
 */
function setupFallbackServer(app, options) {
  log("info", "Setting up fallback server", options);

  // Load config if available
  const configFile = path.join(options.tmpDir, "lmConf-1.json");
  let config = {
    portal: "http://auth.example.com/",
    domain: "example.com",
    cookieName: "lemonldap",
  };

  if (fs.existsSync(configFile)) {
    try {
      config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
    } catch (e) {
      log("warn", `Failed to parse config: ${e.message}`, options);
    }
  }

  const cookieName = config.cookieName || "lemonldap";
  const domain = config.domain || "example.com";

  // Demo users
  const demoUsers = {
    dwho: { _password: "dwho", uid: "dwho", cn: "Doctor Who", mail: "dwho@badwolf.org" },
    rtyler: { _password: "rtyler", uid: "rtyler", cn: "Rose Tyler", mail: "rtyler@badwolf.org" },
    msmith: { _password: "msmith", uid: "msmith", cn: "Mickey Smith", mail: "msmith@badwolf.org" },
    french: { _password: "french", uid: "french", cn: "Frédéric Accents", mail: "fa@badwolf.org" },
    russian: { _password: "russian", uid: "russian", cn: "Русский", mail: "ru@badwolf.org" },
    davros: { _password: "davros", uid: "davros", cn: "Bad Guy", mail: "davros@badguy.org" },
    dalek: { _password: "dalek", uid: "dalek", cn: "The Daleks", mail: "dalek@badguy.org" },
  };

  // Middlewares
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // Session helpers
  function getSession(sessionId) {
    const sessionFile = path.join(options.tmpDir, sessionId);
    if (fs.existsSync(sessionFile)) {
      try {
        return JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function saveSession(session) {
    const sessionFile = path.join(options.tmpDir, session._session_id);
    fs.writeFileSync(sessionFile, JSON.stringify(session));
  }

  function deleteSession(sessionId) {
    const sessionFile = path.join(options.tmpDir, sessionId);
    if (fs.existsSync(sessionFile)) {
      fs.unlinkSync(sessionFile);
    }
  }

  function generateSessionId() {
    const chars = "0123456789abcdef";
    let result = "";
    for (let i = 0; i < 64; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  // Session middleware
  app.use((req, res, next) => {
    const sessionId = req.cookies?.[cookieName];
    if (sessionId) {
      const session = getSession(sessionId);
      if (session) {
        const now = Math.floor(Date.now() / 1000);
        const timeout = config.timeout || 7200;
        if (now - session._utime < timeout) {
          req.session = session;
          req.sessionId = sessionId;
        }
      }
    }
    next();
  });

  // Main portal endpoint
  app.all("/", (req, res) => {
    const accept = req.headers.accept || "";
    const isHtmlRequest = accept.includes("text/html");

    // Handle logout
    if (req.query.logout !== undefined) {
      if (req.sessionId) {
        deleteSession(req.sessionId);
      }
      res.clearCookie(cookieName, { path: "/", domain: domain });

      if (isHtmlRequest) {
        return res.send(`<!DOCTYPE html><html><head><title>Logout</title></head>
<body><h1>Logged out</h1><span trmsg="47">Disconnected</span></body></html>`);
      }
      return res.json({ result: 1 });
    }

    // Handle POST
    if (req.method === "POST") {
      const { user, password } = req.body;
      const userData = demoUsers[user];

      if (userData && userData._password === password) {
        const sessionId = generateSessionId();
        const now = Math.floor(Date.now() / 1000);
        const session = {
          _session_id: sessionId,
          _session_kind: "SSO",
          _utime: now,
          _user: user,
          uid: user,
          cn: userData.cn,
          mail: userData.mail,
          authenticationLevel: 1,
        };
        saveSession(session);
        res.cookie(cookieName, sessionId, { path: "/", domain: domain });

        if (isHtmlRequest) {
          return res.send(`<!DOCTYPE html><html><head><title>Menu</title></head>
<body><h1>Welcome ${userData.cn}</h1><span id="languages"></span></body></html>`);
        }
        return res.json({ result: 1, id: sessionId });
      } else {
        if (isHtmlRequest) {
          return res.send(`<!DOCTYPE html><html><head><title>Auth</title></head>
<body><span trmsg="5">Bad credentials</span>
<form action="" method="post">
<input name="user" value="${user || ""}"><input name="password" type="password">
<button><span trspan="connect">Connect</span></button>
</form></body></html>`);
        }
        return res.status(401).json({ result: 0, error: 5 });
      }
    }

    // GET with session
    if (req.session) {
      if (req.query.url) {
        const url = Buffer.from(req.query.url, "base64").toString();
        res.setHeader("Lm-Remote-User", req.session.uid || "");
        return res.redirect(302, url);
      }

      res.setHeader("Lm-Remote-User", req.session.uid || "");
      if (isHtmlRequest) {
        return res.send(`<!DOCTYPE html><html><head><title>Menu</title></head>
<body><h1>Welcome ${req.session.cn}</h1><span id="languages"></span></body></html>`);
      }
      return res.json({ result: 1, user: req.session.uid });
    }

    // Not authenticated
    if (req.query.url) {
      const url = Buffer.from(req.query.url, "base64").toString();
      try {
        const urlHost = new URL(url).hostname;
        if (!config.locationRules?.[urlHost]) {
          if (isHtmlRequest) {
            return res.send(`<!DOCTYPE html><html><body>
<span trmsg="109">Unprotected URL</span><span id="languages"></span></body></html>`);
          }
          return res.status(401).json({ error: 109 });
        }
      } catch (e) {}
    }

    if (config.strictTransportSecurityMax_Age) {
      res.setHeader("Strict-Transport-Security", `max-age=${config.strictTransportSecurityMax_Age}`);
    }

    if (isHtmlRequest) {
      const favicon = config.portalFavicon || "common/favicon.ico";
      return res.send(`<!DOCTYPE html><html><head><title>Auth</title>
<link href="/static/${favicon}" rel="icon"></head>
<body><span trmsg="9">Please authenticate</span><span id="languages"></span>
<form action="" method="post">
<input name="user"><input name="password" type="password">
<button><span trspan="connect">Connect</span></button>
</form></body></html>`);
    }
    return res.status(401).json({ error: 9 });
  });

  // Catch-all
  app.use((req, res) => {
    res.status(404).json({ error: "Not found", path: req.path });
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
