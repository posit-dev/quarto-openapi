import type { OpenAPISpec, Schema, Reference } from "./types.ts";
import { isReference } from "./types.ts";

/**
 * Resolve a $ref string like "#/components/schemas/Content" to the
 * referenced object in the spec. Returns undefined if not found.
 */
export function resolveRef(
  spec: OpenAPISpec,
  ref: string,
): Record<string, unknown> | undefined {
  // Only handle local refs (#/...)
  if (!ref.startsWith("#/")) return undefined;

  const path = ref.slice(2).split("/");
  let current: unknown = spec;
  for (const segment of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current as Record<string, unknown> | undefined;
}

/**
 * Recursively expand all $ref occurrences in an object, returning a
 * new object with refs replaced by their resolved values.
 *
 * Tracks seen refs to avoid infinite recursion from circular references.
 */
export function expandRefs<T>(
  spec: OpenAPISpec,
  obj: T,
  seen: Set<string> = new Set(),
): T {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj;
  }

  if (isReference(obj)) {
    const ref = obj.$ref;
    if (seen.has(ref)) {
      // Circular reference — return a stub to avoid infinite recursion
      return { description: `(circular reference: ${ref})` } as T;
    }
    const resolved = resolveRef(spec, ref);
    if (resolved === undefined) {
      return { description: `(unresolved reference: ${ref})` } as T;
    }
    seen.add(ref);
    const expanded = expandRefs(spec, resolved, seen);
    seen.delete(ref);
    return expanded as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => expandRefs(spec, item, seen)) as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = expandRefs(spec, value, seen);
  }
  return result as T;
}

/**
 * Resolve a single ref-or-value. If it's a $ref, resolve and expand it.
 * If it's already a concrete value, expand any nested refs.
 */
export function resolve<T>(
  spec: OpenAPISpec,
  obj: T | Reference,
): T {
  return expandRefs(spec, obj);
}
