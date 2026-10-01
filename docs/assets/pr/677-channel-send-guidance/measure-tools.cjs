const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(process.argv[2] || '.');
const out = path.resolve(process.argv[3] || 'tool-inventory.json');
const ts = require(require.resolve('typescript-legacy', { paths: [root] }));
const filename = path.join(root, 'packages/core/src/runtime/dsh-bot-agent-adapter.ts');
const source = fs.readFileSync(filename, 'utf8');
const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
function literal(node) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(node.properties.map((p) => [p.name.text, literal(p.initializer)]));
  }
  throw new Error('Unsupported schema expression: ' + node.getText(ast));
}
(async () => {
  const modulePath = require.resolve('@deepseek-ai/dsh-tools', {
    paths: [path.join(root, 'packages/core')],
  });
  const { defineTool } = await import(pathToFileURL(modulePath).href);
  const rows = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'defineTool') {
      if (
        !ts.isCallExpression(node.parent) ||
        node.parent.expression.getText(ast) !== 'registerTool'
      ) {
        throw new Error('Tool definition without expected registration');
      }
      const properties = Object.fromEntries(
        node.arguments[0].properties.map((p) => [p.name.text, p]),
      );
      const definition = Object.fromEntries(
        ['name', 'description', 'parameters'].map((key) => [
          key,
          literal(properties[key].initializer),
        ]),
      );
      const compiled = defineTool({
        ...definition,
        output: { schema: { type: 'string' }, render: () => [] },
        execute: () => '',
      });
      rows.push({
        ...definition,
        role: definition.name === 'report_to_orchestrator' ? 'assignment' : 'orchestrator',
        line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
        sourceChars:
          properties.description.getText(ast).length + properties.parameters.getText(ast).length,
        rawJSONChars: JSON.stringify({
          description: definition.description,
          parameters: definition.parameters,
        }).length,
        compiledJSONChars: JSON.stringify({
          description: compiled.description,
          parameters: compiled.parameters,
        }).length,
        registryJSONChars: JSON.stringify({
          name: compiled.name,
          description: compiled.description,
          parameters: compiled.parameters,
        }).length,
        usesJSONResult: properties.execute.getText(ast).includes('JSON.stringify('),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  fs.writeFileSync(out, JSON.stringify(rows, null, 2) + '\n');
  for (const row of rows)
    console.log(
      [row.name, row.role, row.compiledJSONChars, row.registryJSONChars, row.line].join('\t'),
    );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
