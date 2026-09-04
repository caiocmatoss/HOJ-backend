// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseArgs } = require("../../scripts/set-user-role.cjs") as { parseArgs: (args: string[]) => { email: string; role: string } };

describe("set-user-role argument validation", () => {
  it.each([
    [["admin@example.com", "USER"], "USER"],
    [["admin@example.com", "ADMIN"], "ADMIN"],
  ])("accepts %s", (args, role) => {
    expect(parseArgs(args)).toEqual({ email: "admin@example.com", role });
  });

  it.each([
    [[], "missing arguments"],
    [["admin@example.com"], "missing role"],
    [["admin@example.com", "OWNER"], "invalid role"],
    [["not-an-email", "ADMIN"], "invalid email"],
    [["admin@example.com", "ADMIN", "extra"], "extra arguments"],
  ])("rejects %s (%s)", (args) => {
    expect(() => parseArgs(args)).toThrow("Usage:");
  });
});