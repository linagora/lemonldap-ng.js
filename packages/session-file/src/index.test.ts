const sessionFile = require("..");
const fs = require("fs");
const path = require("path");

let sessionConn;

beforeAll(() => {
  sessionConn = new sessionFile({ Directory: __dirname });
});

afterAll(() => {
  fs.rmSync(path.join(__dirname, "aaaaaaaaaaaa"));
});

test("able to update session", async () => {
  const res = await sessionConn.update({
    _session_id: "aaaaaaaaaaaa",
    _utime: 11,
    f1: "field: 1",
    f2: "field: 2",
  });
  expect(res).toBeTruthy();
  const session = await sessionConn.get("aaaaaaaaaaaa");
  expect(session.f1).toEqual("field: 1");
  expect(session.f2).toEqual("field: 2");
});

test("able to get session", async () => {
  const session = await sessionConn.get("aaaaaaaaaaaa");
  expect(session.f1).toEqual("field: 1");
});
