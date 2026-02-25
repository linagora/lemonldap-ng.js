const { default: PerlDBI } = require("perl-dbi");
const CDBI = require("..");
const fs = require("fs");

const db = `${__dirname}/db.sqlite`;
const dbiChain = `dbi:SQLite:dbname=${db}`;

const clean = () => {
  try {
    fs.unlinkSync(db);
  } catch (e) {
    console.debug(e);
  }
};

let cdbi;

beforeAll(async () => {
  clean();

  const conn = PerlDBI({
    dbiChain,
  });
  await conn.schema.createTable("lmconfig", function (table) {
    table.integer("cfgNum");
    table.string("field");
    table.string("value");
  });
  conn.destroy();
  cdbi = new CDBI({ dbiChain });
});

afterAll(() => {
  cdbi.destroy();
  clean();
});

test("store new conf", async () => {
  const res = await cdbi.store({ cfgNum: 1, f1: "field 1" });
  expect(res).toBe(true);
});

test("read new conf", async () => {
  const res = await cdbi.load(1);
  expect(res.f1).toEqual("field 1");
});

test("store updated conf", async () => {
  const res = await cdbi.store({ cfgNum: 1, f1: "field 2" });
  expect(res).toBe(true);
});

test("read updated conf", async () => {
  const res = await cdbi.load(1);
  expect(res.f1).toEqual("field 2");
});
