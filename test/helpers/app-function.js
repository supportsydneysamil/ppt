import assert from "node:assert/strict";

export function functionBody(source, name, { stripComments = true } = {}) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);

  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let parametersEnd = -1;

  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        parametersEnd = index;
        break;
      }
    }
  }

  assert.notEqual(parametersEnd, -1, `${name} parameters are unbalanced`);
  const bodyStart = source.indexOf("{", parametersEnd);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        const body = source.slice(bodyStart, index + 1);
        return stripComments
          ? body
              .replace(/(^|\s)\/\/[^\n]*/g, "$1")
              .replace(/\/\*[\s\S]*?\*\//g, "")
          : body;
      }
    }
  }

  throw new Error(`${name} body is unbalanced`);
}

export function compileFunction(
  source,
  name,
  parameters,
  dependencies = {}
) {
  const dependencyNames = Object.keys(dependencies);
  const factory = new Function(
    ...dependencyNames,
    `return function (${parameters.join(", ")}) ${functionBody(source, name)};`
  );
  return factory(...Object.values(dependencies));
}

export function compileAsyncFunction(
  source,
  name,
  parameters,
  dependencies = {}
) {
  const dependencyNames = Object.keys(dependencies);
  const factory = new Function(
    ...dependencyNames,
    `return async function (${parameters.join(", ")}) ${functionBody(source, name)};`
  );
  return factory(...Object.values(dependencies));
}
