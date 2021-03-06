import resolve from 'browser-resolve';
import hashsum from 'hash-sum';
import type FSType from 'fs';
import evaluateCode from '../../../loaders/eval';

let cache = {};
let transpileBeforeExec = false;

export const resetCache = () => {
  cache = {};
  transpileBeforeExec = false;
};

export default function evaluate(
  fs: FSType,
  BFSRequire: Function,
  code: string,
  path = '/',
  availablePlugins,
  availablePresets
) {
  const require = (requirePath: string) => {
    if (requirePath === 'assert') {
      return () => {};
    }

    if (requirePath === 'babel-register') {
      transpileBeforeExec = true;
      return () => {};
    }

    if (requirePath === 'require-from-string') {
      return (newCode: string) =>
        evaluate(
          fs,
          BFSRequire,
          newCode,
          '/',
          availablePlugins,
          availablePresets
        );
    }

    const requiredNativeModule = BFSRequire(requirePath);

    if (requiredNativeModule) {
      return requiredNativeModule;
    }

    const plugin =
      availablePlugins[requirePath] ||
      availablePlugins[requirePath.replace('babel-plugin-', '')] ||
      availablePlugins[requirePath.replace('@babel/plugin-', '')];
    if (plugin) {
      return plugin;
    }

    const preset =
      availablePresets[requirePath] ||
      availablePresets[requirePath.replace('babel-preset-', '')] ||
      availablePresets[requirePath.replace('@babel/preset-', '')];
    if (preset) {
      return preset;
    }

    const resolvedPath = resolve.sync(requirePath, {
      filename: path,
      extensions: ['.js', '.json'],
      moduleDirectory: ['node_modules'],
    });

    let resolvedCode = fs.readFileSync(resolvedPath).toString();
    const id = hashsum(resolvedCode + resolvedPath);

    if (cache[id]) {
      return cache[id];
    }

    cache[id] = {};

    if (transpileBeforeExec) {
      const { code: transpiledCode } = Babel.transform(resolvedCode);

      resolvedCode = transpiledCode;
    }

    cache[id] = evaluate(
      fs,
      BFSRequire,
      resolvedCode,
      resolvedPath,
      availablePlugins,
      availablePresets
    );

    return cache[id];
  };

  // require.resolve is often used in .babelrc configs to resolve the correct plugin path,
  // we want to return a function for that, because our babelrc configs don't really understand
  // strings as plugins.
  require.resolve = require;

  const module = {
    id: path,
    exports: {},
  };

  let finalCode = code;
  if (path.endsWith('.json')) {
    finalCode = `module.exports = JSON.parse(${JSON.stringify(code)})`;
  }
  finalCode += `\n//# sourceURL=${location.origin}${path}`;

  evaluateCode(finalCode, require, module);

  return module.exports;
}

export function evaluateFromPath(
  fs: FSType,
  BFSRequire: Function,
  path: string,
  currentPath: string,
  availablePlugins: Object,
  availablePresets: Object
) {
  const resolvedPath = resolve.sync(path, {
    filename: currentPath,
    extensions: ['.js', '.json'],
    moduleDirectory: ['node_modules'],
  });

  const code = fs.readFileSync(resolvedPath).toString();

  return evaluate(
    fs,
    BFSRequire,
    code,
    resolvedPath,
    availablePlugins,
    availablePresets
  );
}
