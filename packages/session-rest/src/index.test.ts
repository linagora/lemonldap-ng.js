import { createServer, Server, IncomingMessage, ServerResponse } from "http";
const sessionREST = require("..");

let server: Server;
let port: number;
let handler: (
  req: IncomingMessage,
  res: ServerResponse,
) => void | Promise<void>;

const id = "aaaaaaaaaaaaaa";

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

test("able to get session", async () => {
  handler = (req, res) => {
    expect(req.url).toEqual(`/${id}`);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(`{"_session_id":"${id}","f1":"field 1"}`);
  };

  const baseUrl = `http://localhost:${port}`;
  const sessionConn = new sessionREST({ baseUrl });
  const session = await sessionConn.get(id);
  expect(session.f1).toEqual("field 1");
});
