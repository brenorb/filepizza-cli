import { expect, it } from "vitest";
import { outputMode } from "../src/output-mode.js";

it("chooses human output on terminals and preserves JSON pipelines", () => {
  expect(outputMode({}, true)).toBe("plain");
  expect(outputMode({}, false)).toBe("json");
  expect(outputMode({ json: true }, true)).toBe("json");
  expect(outputMode({ plain: true }, false)).toBe("plain");
});
