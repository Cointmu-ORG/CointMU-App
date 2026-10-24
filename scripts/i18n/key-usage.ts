import { parseSync } from "oxc-parser";
import type { KeyIndex } from "./locale-catalog";

/** A translation key referenced from source, literal or templated. */
export interface KeyRef {
  readonly file: string;
  readonly line: number;
  /** Key as written; template expressions shown as `${…}`. */
  readonly raw: string;
  /** Namespaces i18next would search, in order. */
  readonly namespaces: readonly string[];
  /** Key without namespace; a template becomes a per-segment pattern. */
  readonly key: string | RegExp;
}

interface AstNode {
  readonly type: string;
  readonly start: number;
  readonly [field: string]: unknown;
}

const DEFAULT_NAMESPACE = "common";
const NS_SEPARATOR = ":";
const TEMPLATE_HOLE = "${…}";
/** A template like `mining:peerHint.${code}` built outside t() and passed in later. */
const KEY_TEMPLATE_PREFIX = /^[a-zA-Z]+:[\w.]+\.$/;
/** A full key like `settings:privacy.sendingHeld` kept in a map and passed to t() later. */
const KEY_LITERAL = /^[a-zA-Z]+:\w+(\.\w+)+$/;

function isNode(value: unknown): value is AstNode {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

function walk(
  node: unknown,
  visit: (node: AstNode, parent: AstNode | null) => void,
  parent: AstNode | null = null,
): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent);
    return;
  }
  if (!isNode(node)) return;
  visit(node, parent);
  for (const value of Object.values(node)) {
    if (typeof value === "object" && value !== null) walk(value, visit, node);
  }
}

function stringValue(node: unknown): string | null {
  if (isNode(node) && node.type === "Literal" && typeof node.value === "string")
    return node.value;
  return null;
}

function calleeName(call: AstNode): string {
  const callee = call.callee;
  if (!isNode(callee)) return "";
  if (callee.type === "Identifier") return String(callee.name);
  if (callee.type === "MemberExpression" && isNode(callee.property))
    return String(callee.property.name ?? "");
  return "";
}

function templateParts(node: AstNode): { quasis: string[]; holes: number } {
  const quasis = (node.quasis as AstNode[]).map((q) =>
    String((q.value as { cooked: string }).cooked),
  );
  return { quasis, holes: (node.expressions as unknown[]).length };
}

/**
 * Lists the namespaces a file's t() resolves against: the first namespace of
 * each useTranslation() call, then i18next's fallbackNS.
 * @param program - Parsed file.
 * @returns Namespaces in lookup order.
 */
function fileNamespaces(program: unknown): string[] {
  const namespaces: string[] = [];
  walk(program, (node) => {
    if (node.type !== "CallExpression" || calleeName(node) !== "useTranslation")
      return;
    const [arg] = node.arguments as unknown[];
    const first =
      isNode(arg) && arg.type === "ArrayExpression"
        ? (arg.elements as unknown[])[0]
        : arg;
    namespaces.push(stringValue(first) ?? DEFAULT_NAMESPACE);
  });
  return [...new Set([...namespaces, DEFAULT_NAMESPACE])];
}

function splitNamespace(
  raw: string,
  defaults: readonly string[],
): { namespaces: readonly string[]; rest: string } {
  const separator = raw.indexOf(NS_SEPARATOR);
  if (separator === -1) return { namespaces: defaults, rest: raw };
  return {
    namespaces: [raw.slice(0, separator)],
    rest: raw.slice(separator + 1),
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function templateKey(
  node: AstNode,
  defaults: readonly string[],
): Omit<KeyRef, "file" | "line"> | null {
  const { quasis, holes } = templateParts(node);
  const raw = quasis.join(TEMPLATE_HOLE);
  if (holes === 0) return { raw, ...literalKey(raw, defaults) };
  if (!quasis[0]) return null;
  const { namespaces, rest } = splitNamespace(raw, defaults);
  const pattern = rest.split(TEMPLATE_HOLE).map(escapeRegExp).join("[^.]+");
  return { raw, namespaces, key: new RegExp(`^${pattern}$`) };
}

function literalKey(
  raw: string,
  defaults: readonly string[],
): Pick<KeyRef, "namespaces" | "key"> {
  const { namespaces, rest } = splitNamespace(raw, defaults);
  return { namespaces, key: rest };
}

/** Collects keys from a t() argument, following ternary and `??`/`||` branches. */
function keysFromArgument(
  node: unknown,
  defaults: readonly string[],
): Omit<KeyRef, "file" | "line">[] {
  if (!isNode(node)) return [];
  const literal = stringValue(node);
  if (literal !== null)
    return [{ raw: literal, ...literalKey(literal, defaults) }];
  if (node.type === "TemplateLiteral")
    return [templateKey(node, defaults)].filter((ref) => ref !== null);
  if (node.type === "ConditionalExpression")
    return [node.consequent, node.alternate].flatMap((n) =>
      keysFromArgument(n, defaults),
    );
  if (node.type === "LogicalExpression")
    return [node.left, node.right].flatMap((n) =>
      keysFromArgument(n, defaults),
    );
  return [];
}

function isKeyTemplateOutsideT(node: AstNode, parent: AstNode | null): boolean {
  if (
    node.type !== "TemplateLiteral" ||
    (node.expressions as unknown[]).length === 0
  )
    return false;
  if (parent?.type === "CallExpression" && calleeName(parent) === "t")
    return false;
  return KEY_TEMPLATE_PREFIX.test(templateParts(node).quasis[0]);
}

function isKeyLiteralOutsideT(node: AstNode): boolean {
  const literal = stringValue(node);
  return literal !== null && KEY_LITERAL.test(literal);
}

/** Records the offsets of every node inside a t()/i18nKey argument. */
function markConsumed(node: unknown, consumed: Set<number>): void {
  walk(node, (inner) => consumed.add(inner.start));
}

/**
 * Finds translation keys referenced by a source file: t()/i18n.t() first
 * arguments, `<Trans i18nKey>`, `ns:prefix.${…}` templates built for t(), and
 * namespaced literals with a dotted path (`ns:a.b`) kept in maps for t().
 * Non-literal arguments (plain variables) cannot be checked and are skipped.
 * @param file - Path used in the returned references.
 * @param source - File contents.
 * @returns Every statically known key reference.
 * @throws When the file does not parse.
 */
export function collectKeyRefs(file: string, source: string): KeyRef[] {
  const result = parseSync(file, source, { sourceType: "module" });
  if (result.errors.length > 0)
    throw new Error(`Cannot parse ${file}: ${result.errors[0].message}`);
  const defaults = fileNamespaces(result.program);
  const lineOf = (offset: number): number =>
    source.slice(0, offset).split("\n").length;
  const refs = new Map<string, KeyRef>();
  const consumed = new Set<number>();
  walk(result.program, (node, parent) => {
    let found: Omit<KeyRef, "file" | "line">[] = [];
    if (node.type === "CallExpression" && calleeName(node) === "t") {
      const [argument] = node.arguments as unknown[];
      found = keysFromArgument(argument, defaults);
      markConsumed(argument, consumed);
    } else if (
      node.type === "JSXAttribute" &&
      isNode(node.name) &&
      node.name.name === "i18nKey"
    ) {
      found = keysFromArgument(node.value, defaults);
      markConsumed(node.value, consumed);
    } else if (isKeyTemplateOutsideT(node, parent)) {
      found = keysFromArgument(node, defaults);
    } else if (!consumed.has(node.start) && isKeyLiteralOutsideT(node)) {
      found = keysFromArgument(node, defaults);
    }
    for (const ref of found) {
      const line = lineOf(node.start);
      refs.set(`${line}:${ref.raw}`, { file, line, ...ref });
    }
  });
  return [...refs.values()];
}

/**
 * Checks whether a reference resolves in any of its namespaces.
 * @param ref - The reference.
 * @param index - Union of keys across all locales.
 * @returns True when i18next would find a translation.
 */
export function isResolvable(ref: KeyRef, index: KeyIndex): boolean {
  return ref.namespaces.some((namespace) => {
    const keys = index.get(namespace);
    if (!keys) return false;
    if (typeof ref.key === "string") return keys.has(ref.key);
    const pattern = ref.key;
    return [...keys].some((key) => pattern.test(key));
  });
}

/**
 * Reads the namespace list registered in the renderer i18n config.
 * @param source - Contents of the file declaring `const namespaces = [...]`.
 * @returns The registered namespaces.
 * @throws When the declaration is missing or not a string array.
 */
export function readRegisteredNamespaces(source: string): string[] {
  const { program } = parseSync("i18n.ts", source, { sourceType: "module" });
  const declarations: string[][] = [];
  walk(program, (node) => {
    if (
      node.type !== "VariableDeclarator" ||
      !isNode(node.id) ||
      node.id.name !== "namespaces"
    )
      return;
    const init =
      isNode(node.init) && node.init.type === "TSAsExpression"
        ? node.init.expression
        : node.init;
    if (!isNode(init) || init.type !== "ArrayExpression") return;
    declarations.push(
      (init.elements as unknown[]).map((element) => stringValue(element) ?? ""),
    );
  });
  const [namespaces] = declarations;
  if (!namespaces || namespaces.includes("")) {
    throw new Error(
      'i18n config must declare `const namespaces = ["…"]` with string literals only',
    );
  }
  return namespaces;
}
