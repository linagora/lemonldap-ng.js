"use strict";

const YAMLConf = require("../");

const path = require("path");
const { rimraf } = require("rimraf");
const mkdirp = require("mkdirp");
const dir = path.join(__dirname, "conf");

let yamlConfs;

const clean = () => {
  rimraf(dir)
    .then(() => {})
    .catch(console.error);
};

beforeAll(async () => {
  clean();

  await mkdirp(dir);
  yamlConfs = new YAMLConf({ dirName: dir });
});

afterAll(clean);

test("store new conf", async () => {
  const res = await yamlConfs.store({ cfgNum: 1, f1: "field 1", _utime: 11 });
  expect(res).toBeTruthy();
});

test("read new conf", async () => {
  const res = await yamlConfs.load(1);
  expect(res.f1).toEqual("field 1");
});

test("store updated conf", async () => {
  const res = await yamlConfs.store({ cfgNum: 1, f1: "field 2" });
  expect(res).toBe(true);
});

test("read updated conf", async () => {
  const res = await yamlConfs.load(1);
  expect(res.f1).toEqual("field 2");
});

test("available", async () => {
  const res = await yamlConfs.available();
  expect(res).toEqual([1]);
});

test("lastCfg", async () => {
  const res = await yamlConfs.lastCfg();
  expect(res).toEqual(1);
});
