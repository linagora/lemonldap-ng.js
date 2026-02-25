const { default: PerlDBI } = require("perl-dbi");
const DBI = require("..");
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

beforeAll(async () => {
  clean();

  const conn = PerlDBI({
    dbiChain,
  });
  await conn.schema.createTable("lmconfig", function (table) {
    table.integer("cfgNum");
    table.string("data");
  });
  for (let i = 0; i < 10; i++) {
    await conn.insert({ cfgNum: i, data: "d" }).into("lmconfig");
  }
  conn.destroy();
});

afterAll(clean);

test("available", async () => {
  const dbi = new DBI({ dbiChain });
  const res = await dbi.available();
  expect(res).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  dbi.destroy();
});

test("lastCfg", async () => {
  const dbi = new DBI({ dbiChain });
  const res = await dbi.lastCfg();
  expect(res).toEqual(9);
  dbi.destroy();
});
