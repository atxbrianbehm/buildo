function normalizeForJson(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot canonicalize non-finite number: ${value}`);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForJson(item));
  }

  if (typeof value === "object") {
    const input = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(input)
        .filter((key) => input[key] !== undefined)
        .sort()
        .map((key) => [key, normalizeForJson(input[key])])
    );
  }

  throw new Error(`Cannot canonicalize value of type ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeForJson(value));
}

