// Reuse the project's illustration, provider SVGs and installed Tailwind compiler.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const repo = path.resolve(__dirname, '../../../..');
const requireNext = createRequire(path.join(repo, 'apps/next/package.json'));
const requirePostcss = createRequire(requireNext.resolve('@tailwindcss/postcss'));
const { compile } = requirePostcss('@tailwindcss/node');
async function main() {
  let html = await fs.readFile(path.join(__dirname, 'source.html'), 'utf8');
  const script = await fs.readFile(path.join(__dirname, 'interactions.js'), 'utf8');
  const original = await fs.readFile(path.join(repo, 'apps/next/src/view/auth/login-page.tsx'), 'utf8');
  const google = original.match(/return (<svg viewBox="0 0 24 24"[\s\S]*?<\/svg>);/)[1];
  const paths = original.match(/<path d=\{id === "apple"\s*\? "([^"]+)"\s*: "([^"]+)"/);
  const icon = value => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${value}"/></svg>`;
  html = html.replace('{{GOOGLE}}', google).replace('{{APPLE}}', icon(paths[1])).replace('{{GITHUB}}', icon(paths[2]));
  const background = await fs.readFile(path.join(repo, 'apps/next/public/images/login-background.webp'));
  html = html.replace('/* BACKGROUND */', 'data:image/webp;base64,' + background.toString('base64')).replace('/* INTERACTIONS */', script);
  const candidates = [...html.matchAll(/class="([^"]+)"/g)].flatMap(item => item[1].split(/\s+/));
  const compiler = await compile('@import "tailwindcss";', { base:path.join(repo, 'apps/next'), onDependency() {} });
  html = html.replace('/* TAILWIND */', compiler.build(candidates));
  await fs.writeFile(path.join(__dirname, 'login.html'), html);
  console.log('Built self-contained login preview, including original WebP and SVGs:', Buffer.byteLength(html), 'bytes');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
