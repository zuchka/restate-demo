import assert from "node:assert/strict";
import test from "node:test";
import { evaluateExpression } from "../../apps/controller/src/math.ts";

test("evaluates precedence, parentheses, unary values, and right-associative powers", () => {
  assert.equal(evaluateExpression("12 * 60"), 720);
  assert.equal(evaluateExpression("2 + 3 * 4"), 14);
  assert.equal(evaluateExpression("(2 + 3) * 4"), 20);
  assert.equal(evaluateExpression("-8 + 3"), -5);
  assert.equal(evaluateExpression("2 ^ 3 ^ 2"), 512);
});

test("rejects unsafe or malformed expressions", () => {
  assert.throws(() => evaluateExpression("1 / 0"), /divide by zero/);
  assert.throws(() => evaluateExpression("2 + process.exit()"), /Unsupported character/);
  assert.throws(() => evaluateExpression("(2 + 3"), /closing parenthesis/);
  assert.throws(() => evaluateExpression("1e20 * 2"), /Unsupported character/);
  assert.throws(() => evaluateExpression("9 ^ 99"), /supported range/);
});
