import { StringUtils } from "./string.util";

describe("string normalizer", () => {
  it("should trim edge spaces", () => {
    expect(StringUtils.normalizeSpace("  a  ")).toBe("a");
  });

  it("should trim embedded spaces", () => {
    expect(StringUtils.normalizeSpace("  a  b  ")).toBe("a b");
  });
});

describe("random code generation", () => {
  it("should generate code containing just numbers", async () => {
    expect(await StringUtils.generateCode()).toMatch(/\d+/);
  });

  it("should generate code with 6 characters by default", async () => {
    expect((await StringUtils.generateCode()).length).toBe(6);
  });

  it("should generate code with given length", async () => {
    expect((await StringUtils.generateCode(4)).length).toBe(4);
  });
});
