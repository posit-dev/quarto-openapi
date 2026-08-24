/**
 * Stand-ins for the Deno std assertions the tests use, backed by node:assert.
 *
 * Keeping the Deno names lets the test bodies stay as they are, and the
 * wrappers keep the failure messages informative — node:assert's `ok()`
 * reports only "the expression evaluated to a falsy value".
 */
import { strict as nodeAssert } from "node:assert";

export function assert(value: unknown, msg?: string): asserts value {
  nodeAssert.ok(value, msg);
}

export function assertFalse(value: unknown, msg?: string): void {
  nodeAssert.ok(!value, msg ?? `Expected a falsy value, got: ${value}`);
}

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  nodeAssert.deepStrictEqual(actual, expected, msg);
}

export function assertStringIncludes(
  actual: string,
  expected: string,
  msg?: string,
): void {
  nodeAssert.ok(
    actual.includes(expected),
    msg ?? `Expected string to include ${JSON.stringify(expected)}:\n${actual}`,
  );
}
