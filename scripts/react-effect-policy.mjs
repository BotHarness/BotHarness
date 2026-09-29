import traverseModule from '@babel/traverse';

const traverse = typeof traverseModule === 'function' ? traverseModule : traverseModule.default;

function fromReact(binding) {
  return (
    binding?.path.parentPath?.isImportDeclaration() &&
    binding.path.parentPath.node.source.value === 'react'
  );
}

function propertyName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  return undefined;
}

function reactNamespace(path, seen = new Set()) {
  if (!path.isIdentifier()) return false;
  const binding = path.scope.getBinding(path.node.name);
  if (!binding || seen.has(binding)) return false;
  if (
    (binding.path.isImportDefaultSpecifier() || binding.path.isImportNamespaceSpecifier()) &&
    fromReact(binding)
  )
    return true;
  if (
    binding.path.isVariableDeclarator() &&
    binding.path.node.id.type === 'Identifier' &&
    binding.path.node.init
  ) {
    return reactNamespace(binding.path.get('init'), new Set([...seen, binding]));
  }
  return false;
}

function reactEffect(path, seen = new Set()) {
  if (path.isIdentifier()) {
    const binding = path.scope.getBinding(path.node.name);
    if (!binding || seen.has(binding)) return false;
    if (binding.path.isImportSpecifier() && fromReact(binding)) {
      return propertyName(binding.path.node.imported) === 'useEffect';
    }
    if (binding.path.isVariableDeclarator() && binding.path.node.init) {
      const declaration = binding.path.node.id;
      const next = new Set([...seen, binding]);
      if (declaration.type === 'Identifier') return reactEffect(binding.path.get('init'), next);
      if (declaration.type === 'ObjectPattern') {
        const property = declaration.properties.find(
          (candidate) =>
            candidate.type === 'ObjectProperty' &&
            propertyName(candidate.key) === 'useEffect' &&
            (candidate.value.type === 'Identifier'
              ? candidate.value.name === binding.identifier.name
              : candidate.value.type === 'AssignmentPattern' &&
                candidate.value.left.type === 'Identifier' &&
                candidate.value.left.name === binding.identifier.name),
        );
        return Boolean(property && reactNamespace(binding.path.get('init'), next));
      }
    }
    return false;
  }
  if (path.isMemberExpression() || path.isOptionalMemberExpression()) {
    const name = path.node.computed ? propertyName(path.node.property) : path.node.property.name;
    return name === 'useEffect' && reactNamespace(path.get('object'), seen);
  }
  if (path.isConditionalExpression()) {
    return reactEffect(path.get('consequent'), seen) || reactEffect(path.get('alternate'), seen);
  }
  if (
    path.isParenthesizedExpression() ||
    path.isTSAsExpression() ||
    path.isTSSatisfiesExpression() ||
    path.isTSNonNullExpression() ||
    path.isTSTypeAssertion()
  )
    return reactEffect(path.get('expression'), seen);
  return false;
}

export function findReactEffects(parsed) {
  const calls = [];
  const visit = (path) => {
    if (reactEffect(path.get('callee'))) calls.push({ start: path.node.start, end: path.node.end });
  };
  traverse(parsed, { CallExpression: visit, OptionalCallExpression: visit });
  return calls;
}
