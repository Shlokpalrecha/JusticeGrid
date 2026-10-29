/** Bounded, typed expression language. Never executes JavaScript or traverses objects. */
export type Value = string | number | boolean | null;
export type ValueType = "number" | "string" | "boolean";
export type Fields = Readonly<Record<string, ValueType>>;
export type Context = Readonly<Record<string, Value>>;
export type Ast = Readonly<
  | { kind: "literal"; value: Value; type: ValueType }
  | { kind: "field"; name: string; type: ValueType }
  | { kind: "unary"; op: string; child: Ast; type: ValueType }
  | { kind: "binary"; op: string; left: Ast; right: Ast; type: ValueType }
  | { kind: "call"; name: string; args: readonly Ast[]; type: ValueType }
>;
type Token = { text: string; at: number; kind: "number" | "string" | "name" | "symbol" | "end" };
export class ExpressionError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(`${message} at character ${offset + 1}`);
    this.name = "ExpressionError";
  }
}
export function tokenize(source: string): readonly Token[] {
  if (!source.trim() || source.length > 8000)
    throw new ExpressionError("Expression must contain 1–8000 characters", 0);
  const result: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const at = i,
      c = source[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let text = "";
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") {
          i++;
          if (![quote, "\\"].includes(source[i] ?? ""))
            throw new ExpressionError("Only quote/backslash escapes are supported", i);
        }
        text += source[i++]!;
      }
      if (source[i++] !== quote) throw new ExpressionError("Unterminated string", at);
      result.push({ text, at, kind: "string" });
    } else {
      const rest = source.slice(i),
        numeric = /^\d+(?:\.\d+)?/.exec(rest),
        name = /^[A-Za-z_][A-Za-z_0-9]*/.exec(rest);
      const text = numeric?.[0] ?? name?.[0] ?? /^(?:<=|>=|!=|==|[()<>+*/=!,-])/.exec(rest)?.[0];
      if (!text) throw new ExpressionError("Unexpected character", at);
      result.push({ text, at, kind: numeric ? "number" : name ? "name" : "symbol" });
      i += text.length;
    }
    if (result.length > 1024) throw new ExpressionError("Token limit exceeded", at);
  }
  result.push({ text: "", at: i, kind: "end" });
  return result;
}
const PRECEDENCE: Readonly<Record<string, number>> = {
  OR: 1,
  AND: 2,
  "=": 3,
  "==": 3,
  "!=": 3,
  "<": 3,
  ">": 3,
  "<=": 3,
  ">=": 3,
  "+": 4,
  "-": 4,
  "*": 5,
  "/": 5,
};
const ARITHMETIC: Readonly<Record<string, (a: number, b: number) => number>> = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
  "/": (a, b) => (b === 0 ? NaN : a / b),
};
const COMPARE: Readonly<Record<string, (a: Value, b: Value) => boolean>> = {
  "=": (a, b) => a === b,
  "==": (a, b) => a === b,
  "!=": (a, b) => a !== b,
  "<": (a, b) => (a as number) < (b as number),
  ">": (a, b) => (a as number) > (b as number),
  "<=": (a, b) => (a as number) <= (b as number),
  ">=": (a, b) => (a as number) >= (b as number),
};
const FUNCTIONS: Readonly<Record<string, { arity: number; run: (args: number[]) => number }>> = {
  MIN: { arity: 2, run: (a) => Math.min(a[0]!, a[1]!) },
  MAX: { arity: 2, run: (a) => Math.max(a[0]!, a[1]!) },
  FLOOR: { arity: 1, run: (a) => Math.floor(a[0]!) },
  ABS: { arity: 1, run: (a) => Math.abs(a[0]!) },
};
export function compileExpression(
  source: string,
  fields: Fields,
  expected: ValueType = "boolean",
): Ast {
  const tokens = tokenize(source);
  let cursor = 0;
  const peek = () => tokens[cursor]!;
  const take = () => tokens[cursor++]!;
  const require = (text: string) => {
    if (take().text !== text) throw new ExpressionError(`Expected ${text}`, tokens[cursor - 1]!.at);
  };
  function parse(minimum = 0, depth = 0): Ast {
    if (depth > 48) throw new ExpressionError("Expression nesting limit exceeded", peek().at);
    const token = take();
    let left: Ast;
    if (token.text === "(") {
      left = parse(0, depth + 1);
      require(")");
    } else if (["NOT", "!", "-", "+"].includes(token.text.toUpperCase())) {
      const op = token.text.toUpperCase(),
        child = parse(6, depth + 1),
        type = op === "NOT" || op === "!" ? "boolean" : "number";
      if (child.type !== type) throw new ExpressionError(`Unary ${op} requires ${type}`, token.at);
      left = Object.freeze({ kind: "unary", op, child, type });
    } else if (token.kind === "number") {
      if (!Number.isFinite(Number(token.text)))
        throw new ExpressionError("Numeric literal exceeds finite range", token.at);
      left = Object.freeze({ kind: "literal", value: Number(token.text), type: "number" });
    } else if (token.kind === "string")
      left = Object.freeze({ kind: "literal", value: token.text, type: "string" });
    else if (["TRUE", "FALSE"].includes(token.text.toUpperCase()))
      left = Object.freeze({
        kind: "literal",
        value: token.text.toUpperCase() === "TRUE",
        type: "boolean",
      });
    else if (token.kind === "name" && peek().text === "(") {
      const name = token.text.toUpperCase(),
        fn = Object.hasOwn(FUNCTIONS, name) ? FUNCTIONS[name] : undefined;
      if (!fn) throw new ExpressionError("Unknown function", token.at);
      take();
      const args: Ast[] = [parse(0, depth + 1)];
      while (peek().text === ",") {
        take();
        args.push(parse(0, depth + 1));
      }
      require(")");
      if (args.length !== fn.arity || args.some((a) => a.type !== "number"))
        throw new ExpressionError(`${name} requires ${fn.arity} numeric argument(s)`, token.at);
      left = Object.freeze({ kind: "call", name, args: Object.freeze(args), type: "number" });
    } else if (token.kind === "name" && Object.hasOwn(fields, token.text))
      left = Object.freeze({ kind: "field", name: token.text, type: fields[token.text]! });
    else throw new ExpressionError("Unknown field or missing operand", token.at);
    while (true) {
      const op = peek().text.toUpperCase(),
        priority = Object.hasOwn(PRECEDENCE, op) ? PRECEDENCE[op] : undefined;
      if (priority === undefined || priority < minimum) break;
      const operator = take(),
        right = parse(priority + 1, depth + 1),
        logical = op === "AND" || op === "OR",
        arithmetic = Object.hasOwn(ARITHMETIC, op);
      if (
        (logical && (left.type !== "boolean" || right.type !== "boolean")) ||
        (arithmetic && (left.type !== "number" || right.type !== "number")) ||
        (!logical && !arithmetic && left.type !== right.type) ||
        (["<", ">", "<=", ">="].includes(op) && left.type !== "number")
      )
        throw new ExpressionError("Incompatible operand types", operator.at);
      left = Object.freeze({
        kind: "binary",
        op,
        left,
        right,
        type: arithmetic ? "number" : "boolean",
      });
    }
    return left;
  }
  const ast = parse();
  if (peek().kind !== "end") throw new ExpressionError("Unexpected trailing input", peek().at);
  if (ast.type !== expected) throw new ExpressionError(`Expression must return ${expected}`, 0);
  return ast;
}
/** Missing facts propagate UNKNOWN (null), including NOT UNKNOWN. */
export function evaluateExpression(ast: Ast, context: Context): Value {
  switch (ast.kind) {
    case "literal":
      return ast.value;
    case "field": {
      const v = Object.hasOwn(context, ast.name) ? context[ast.name] : null;
      return typeof v === ast.type && (typeof v !== "number" || Number.isFinite(v)) ? v! : null;
    }
    case "unary": {
      const v = evaluateExpression(ast.child, context);
      if (v === null) return null;
      return ast.op === "NOT" || ast.op === "!" ? !v : ast.op === "-" ? -(v as number) : v;
    }
    case "call": {
      const args = ast.args.map((a) => evaluateExpression(a, context));
      if (args.some((a) => a === null)) return null;
      const n = FUNCTIONS[ast.name]!.run(args as number[]);
      return Number.isFinite(n) ? n : null;
    }
    case "binary": {
      const a = evaluateExpression(ast.left, context);
      if (ast.op === "AND" && a === false) return false;
      if (ast.op === "OR" && a === true) return true;
      const b = evaluateExpression(ast.right, context);
      if (ast.op === "AND") return b === false ? false : a === null || b === null ? null : true;
      if (ast.op === "OR") return b === true ? true : a === null || b === null ? null : false;
      if (a === null || b === null) return null;
      if (Object.hasOwn(ARITHMETIC, ast.op)) {
        const n = ARITHMETIC[ast.op]!(a as number, b as number);
        return Number.isFinite(n) ? n : null;
      }
      return COMPARE[ast.op]!(a, b);
    }
  }
}
