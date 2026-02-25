import { createServer, Server, IncomingMessage, ServerResponse } from "http";
const REST = require("..");

let server: Server;
let port: number;
let handler: (
  req: IncomingMessage,
  res: ServerResponse,
) => void | Promise<void>;

const startServer = (): Promise<number> => {
  return new Promise((resolve) => {
    server = createServer(async (req, res) => {
      if (handler) {
        await handler(req, res);
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    server.listen(0, () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        resolve(address.port);
      }
    });
  });
};

beforeAll(async () => {
  port = await startServer();
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  handler = () => {};
});

test("lastCfg", async () => {
  handler = (_req, res) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end('{"cfgNum":1,"f1":"field 1"}');
  };
  const baseUrl = `http://localhost:${port}`;
  const restConf = new REST({ baseUrl });
  const res = await restConf.lastCfg();
  expect(res).toEqual(1);
});

test("load", async () => {
  handler = (req, res) => {
    expect(req.url).toMatch(/^\/+1\?full=1$/);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end('{"cfgNum":1,"f1":"field 1"}');
  };
  const baseUrl = `http://localhost:${port}`;
  const restConf = new REST({ baseUrl });
  const res = await restConf.load(1);
  expect(res).toEqual({ cfgNum: 1, f1: "field 1" });
});

test("authentified load", async () => {
  handler = (req, res) => {
    expect(req.headers.authorization).toEqual("Basic Zm9vOmJhcg==");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end('{"cfgNum":1,"f1":"field 2"}');
  };
  const baseUrl = `http://localhost:${port}`;
  const restConf = new REST({
    baseUrl,
    user: "foo",
    password: "bar",
  });
  const res = await restConf.load(1);
  expect(res).toEqual({ cfgNum: 1, f1: "field 2" });
});

test("required fields", () => {
  expect(() => {
    new REST({});
  }).toThrow(/required/);
  expect(() => {
    new REST({ baseUrl: "foo" });
  }).toThrow(/Bad URL/);
  expect(() => {
    new REST({
      baseUrl: "https://foo",
      user: "foo",
    });
  }).toThrow(/password required/);
});
