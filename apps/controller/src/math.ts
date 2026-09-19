const MAX_EXPRESSION_LENGTH = 160;
const MAX_ABSOLUTE_VALUE = 1e15;

type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "%" | "^" }
  | { type: "left" }
  | { type: "right" };

function tokenize(expression: string): Token[] {
  if (expression.length === 0 || expression.length > MAX_EXPRESSION_LENGTH) {
    throw new Error("Expression must contain between 1 and 160 characters.");
  }

  const tokens: Token[] = [];
  let cursor = 0;

  while (cursor < expression.length) {
    const character = expression[cursor];

    if (/\s/.test(character)) {
      cursor += 1;
      continue;
    }

    if (/[0-9.]/.test(character)) {
      const start = cursor;
      let dots = 0;

      while (cursor < expression.length && /[0-9.]/.test(expression[cursor])) {
        if (expression[cursor] === ".") {
          dots += 1;
        }
        cursor += 1;
      }

      if (dots > 1) {
        throw new Error("Invalid number in expression.");
      }

      const value = Number(expression.slice(start, cursor));
      if (!Number.isFinite(value)) {
        throw new Error("Expression contains an invalid number.");
      }
      tokens.push({ type: "number", value });
      continue;
    }

    if (character === "(") {
      tokens.push({ type: "left" });
      cursor += 1;
      continue;
    }

    if (character === ")") {
      tokens.push({ type: "right" });
      cursor += 1;
      continue;
    }

    if (["+", "-", "*", "/", "%", "^"].includes(character)) {
      tokens.push({
        type: "operator",
        value: character as Extract<Token, { type: "operator" }>["value"],
      });
      cursor += 1;
      continue;
    }

    throw new Error(`Unsupported character: ${character}`);
  }

  return tokens;
}

export function evaluateExpression(expression: string): number {
  const tokens = tokenize(expression);
  let cursor = 0;

  const assertFinite = (value: number) => {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_ABSOLUTE_VALUE) {
      throw new Error("Calculation is outside the supported range.");
    }
    return value;
  };

  const parsePrimary = (): number => {
    const token = tokens[cursor];
    if (!token) {
      throw new Error("Expression ended unexpectedly.");
    }

    if (token.type === "number") {
      cursor += 1;
      return token.value;
    }

    if (token.type === "left") {
      cursor += 1;
      const value = parseAdditive();
      if (tokens[cursor]?.type !== "right") {
        throw new Error("Missing closing parenthesis.");
      }
      cursor += 1;
      return value;
    }

    throw new Error("Expected a number or parenthesis.");
  };

  const parseUnary = (): number => {
    const token = tokens[cursor];
    if (token?.type === "operator" && (token.value === "+" || token.value === "-")) {
      cursor += 1;
      const value = parseUnary();
      return token.value === "-" ? -value : value;
    }
    return parsePrimary();
  };

  const parsePower = (): number => {
    const left = parseUnary();
    const token = tokens[cursor];
    if (token?.type === "operator" && token.value === "^") {
      cursor += 1;
      return assertFinite(left ** parsePower());
    }
    return left;
  };

  const parseMultiplicative = (): number => {
    let value = parsePower();
    while (true) {
      const token = tokens[cursor];
      if (
        token?.type !== "operator" ||
        !["*", "/", "%"].includes(token.value)
      ) {
        return value;
      }

      cursor += 1;
      const right = parsePower();
      if ((token.value === "/" || token.value === "%") && right === 0) {
        throw new Error("Cannot divide by zero.");
      }
      if (token.value === "*") value *= right;
      if (token.value === "/") value /= right;
      if (token.value === "%") value %= right;
      value = assertFinite(value);
    }
  };

  const parseAdditive = (): number => {
    let value = parseMultiplicative();
    while (true) {
      const token = tokens[cursor];
      if (token?.type !== "operator" || !["+", "-"].includes(token.value)) {
        return value;
      }
      cursor += 1;
      const right = parseMultiplicative();
      value = assertFinite(token.value === "+" ? value + right : value - right);
    }
  };

  const result = parseAdditive();
  if (cursor !== tokens.length) {
    throw new Error("Unexpected token in expression.");
  }
  return assertFinite(result);
}
