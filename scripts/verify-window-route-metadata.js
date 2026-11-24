/** 对照实际 page.tsx，检查每个页面的元数据、兼容跳转和可点击父级，不依赖手写页面数量。 */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createRequire } = require('node:module'), vm = require('node:vm');
const root = path.resolve(__dirname, '..'), nextRequire = createRequire(path.join(root, 'apps/next/package.json'));
const ts = nextRequire('typescript');
const source = fs.readFileSync(path.join(root, 'apps/next/src/data/route-metadata.ts'), 'utf8');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsObject, require: nextRequire });
const { ROUTE_METADATA: metadata, routeBreadcrumbs } = exportsObject;
const appRoot = path.join(root, 'apps/next/src/app');

function pageFiles(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? pageFiles(file) : entry.name === 'page.tsx' ? [file] : [];
  });
}

/** 虚拟分类可以没有页面，但不能被当作链接；真实祖先必须能静态导出。 */
function checkParents() {
  const paths = new Set(metadata.map(route => route.path));
  assert.equal(paths.size, metadata.length, 'duplicate metadata path');
  for (const route of metadata) {
    const seen = new Set();
    let current = route;
    while (current) {
      assert(!seen.has(current.path), 'parent cycle: ' + route.path); seen.add(current.path);
      if (current.parent) assert(paths.has(current.parent), 'missing parent: ' + current.parent);
      current = metadata.find(item => item.path === current.parent);
    }
    if (route.navigable !== false) assert(fs.existsSync(path.join(appRoot, route.path, 'page.tsx')), 'linked route has no page: ' + route.path);
    assert(route.title && route.description, 'missing label or purpose: ' + route.path);
  }
}

function main() {
  checkParents();
  const pages = pageFiles(appRoot);
  for (const file of pages) {
    const pathname = '/' + path.relative(appRoot, path.dirname(file)).replaceAll('\\', '/');
    const redirect = fs.readFileSync(file, 'utf8').match(/<ToolRouteRedirect href="([^"]+)"/);
    const expected = redirect?.[1] ?? pathname;
    const trail = routeBreadcrumbs(pathname + (pathname === '/' ? '' : '/'));
    assert.equal(trail.at(-1).path, expected, 'incorrect route: ' + pathname);
    assert(trail.at(-1).title, 'unregistered page: ' + pathname);
  }
  assert.equal(routeBreadcrumbs('/not-registered')[0].title, null, 'unknown route must not invent a label');
  assert.deepEqual(routeBreadcrumbs('/index.html'), routeBreadcrumbs('/'), 'legacy entry must use the actual home metadata');
  assert.deepEqual(routeBreadcrumbs('/index.html/'), routeBreadcrumbs('/'), 'legacy entry trailing slash must also resolve home');
  console.log(`PASS route metadata: ${pages.length} actual pages, parent links, redirect aliases and unknown fallback`);
}
try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
