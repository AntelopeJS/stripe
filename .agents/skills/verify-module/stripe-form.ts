import { isRecord, recordOf, type Json, type JsonRecord } from "./json.ts";

const INDEX = /^\d+$/;

/** The path of nested keys a form field name spells: `items[0][price_data][currency]` is `items`, `0`, `price_data`, `currency`; a trailing `[]` appends. */
function tokensOf(name: string): string[] {
  return name.match(/[^[\]]+|\[\]/g) ?? [name];
}

function assign(container: JsonRecord | Json[], key: string, value: Json): void {
  if (Array.isArray(container)) {
    if (key === "[]") container.push(value);
    else container[Number(key)] = value;
    return;
  }
  container[key] = value;
}

function childOf(container: JsonRecord | Json[], key: string, next: string): JsonRecord | Json[] {
  const existing = Array.isArray(container) ? container[Number(key)] : container[key];
  if (Array.isArray(existing)) return existing;
  if (isRecord(existing)) return recordOf(existing);
  const created: JsonRecord | Json[] = INDEX.test(next) || next === "[]" ? [] : {};
  assign(container, key, created);
  return created;
}

/** One form field written into the object `root` the way Stripe's API reads it. */
function setField(root: JsonRecord, name: string, value: string): void {
  const tokens = tokensOf(name);
  let container: JsonRecord | Json[] = root;
  tokens.forEach((token, index) => {
    const next = tokens[index + 1];
    if (next === undefined) {
      assign(container, token, value);
      return;
    }
    container = childOf(container, token, next);
  });
}

/** Stripe's request encoding: `application/x-www-form-urlencoded` with nested keys in brackets, read into a JSON object whose leaves are strings. */
export function parseForm(text: string): JsonRecord {
  const root: JsonRecord = {};
  for (const [name, value] of new URLSearchParams(text)) setField(root, name, value);
  return root;
}
