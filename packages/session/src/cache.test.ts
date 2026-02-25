const session = require("..");
const fs = require("fs");
const path = require("path");

const cache = path.join(__dirname, "cache");
const realcache = cache + ".node-llng-cache";

const id = "bbbbbbbbbbbbbb";

const clean = () => {
  try {
    fs.rmSync(path.join(__dirname, id), { recursive: true, force: true });
  } catch {
    // Ignore errors if file doesn't exist
  }
  try {
    fs.rmSync(realcache, { recursive: true, force: true });
  } catch {
    // Ignore errors if directory doesn't exist
  }
};

let sessionConn: typeof session;

beforeAll(async () => {
  clean();
  sessionConn = new session({
    storageModule: "Apache::Session::File",
    storageModuleOptions: { Directory: __dirname },
    cacheModule: "Cache::FileCache",
    cacheModuleOptions: {
      default_expires_in: 2,
      cache_root: cache,
    },
  });
  await sessionConn.ready;
});

afterAll(async () => {
  await sessionConn.close();
  clean();
});

test("able to create session via update", async () => {
  const res: boolean = await sessionConn.update({
    _session_id: id,
    f1: "field: 1",
    f2: "field: 2",
  });
  expect(res).toBeTruthy();
  const session: { f1: string; f2: string } = await sessionConn.get(id);
  expect(session.f1).toEqual("field: 1");
  expect(session.f2).toEqual("field: 2");
  expect(sessionConn.inMemoryCache.get(id).f1).toEqual("field: 1");
});

test("able to get session", async () => {
  const session: { f1: string } = await sessionConn.get(id);
  expect(session.f1).toEqual("field: 1");
});

test("able to update session", async () => {
  const res: boolean = await sessionConn.update({
    _session_id: id,
    f1: "field: 3",
    f2: "field: 4",
  });
  expect(res).toBeTruthy();
  const session: { f1: string; f2: string } = await sessionConn.get(id);
  expect(session.f1).toEqual("field: 3");
  expect(session.f2).toEqual("field: 4");
  expect(sessionConn.inMemoryCache.get(id).f1).toEqual("field: 3");
});

test(
  "localCache cleaned",
  async () => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const res: any = await sessionConn.localCache.get(id);
    expect(res).toBeUndefined();
  },
  10000,
);
