// Prepare screenshot crops and transparent project artwork, then compile an offline HTML reference.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const repo = path.resolve(process.argv[2] || path.join(__dirname, '../../../..'));
const requireNext = createRequire(path.join(repo, 'apps/next/package.json'));
const sharp = createRequire(requireNext.resolve('next/package.json'))('sharp');
const { compile } = createRequire(requireNext.resolve('@tailwindcss/postcss'))('@tailwindcss/node');
const paths = {
  image:'M4 4h16v16H4z M4 16l5-5 4 4 3-3 4 5 M15 8h.01',
  video:'M3 6h12v12H3z M15 10l6-3v10l-6-3',
  edit:'M4 20l4-1L20 7l-3-3L5 16z M14 7l3 3',
  users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  mic:'M9 3h6v11H9z M5 10v3a7 7 0 0 0 14 0v-3 M12 20v3 M8 23h8',
  music:'M9 18V5l12-2v13 M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3 M21 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3',
  wand:'m4 4 16 16 M3 9l2-2 M8 3l2 2 M14 4v3 M4 14h3 M17 13l-4 4',
  home:'m3 10 9-8 9 8 M5 9v12h5v-7h4v7h5V9',
  bot:'M4 8h16v12H4z M12 3v5 M9 13h.01 M15 13h.01 M8 17h8 M1 12h3 M20 12h3',
  camera:'M3 7h5l2-3h4l2 3h5v14H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  cloud:'M7 19h11a5 5 0 0 0 0-10 7 7 0 0 0-13-1 5.5 5.5 0 0 0 2 11',
  heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8',
  settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 10h18c0-3-3-3-3-10 M10 22h4',
  sun:'M12 1v2 M12 21v2 M1 12h2 M21 12h2 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon:'M20 14a8 8 0 0 1-10-10A8 8 0 1 0 20 14',
  folder:'M3 5h6l2 3h10v13H3z', search:'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M15 15l6 6',
  plus:'M12 5v14 M5 12h14', down:'m7 10 5 5 5-5', up:'m7 14 5-5 5 5',
  upload:'M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6',
  grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  list:'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  more:'M12 5h.01 M12 12h.01 M12 19h.01', expand:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',
  zoom:'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M15 15l6 6 M7 10h6 M10 7v6',
  info:'M12 10v7 M12 6h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  dice:'M4 4h16v16H4z M8 8h.01 M16 8h.01 M12 12h.01 M8 16h.01 M16 16h.01',
  left:'m15 6-6 6 6 6', right:'m9 6 6 6-6 6',
  check:'m5 12 4 4L19 6', download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
  x:'m6 6 12 12 M18 6 6 18', palette:'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4 9 9 0 0 0-9-6 M7 10h.01 M10 6h.01 M15 6h.01',
  smile:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M8 9h.01 M16 9h.01 M7 14c2 4 8 4 10 0',
  shirt:'m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4c0 4-8 4-8 0',
  mountain:'m2 20 7-15 5 9 3-6 5 12z M6 12l3 2 3-2',
  sliders:'M4 3v6 M4 13v8 M12 3v10 M12 17v4 M20 3v2 M20 9v12 M1 9h6 M9 17h6 M17 5h6',
  book:'M3 3h8v18H3z M11 3h10v18H11 M6 7h2 M14 7h4',
  star:'m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
  sparkles:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z M20 2v4 M18 4h4',
};
async function cropAssets() {
  const input = path.join(__dirname,'assets/reference.png');
  const crops = {
    hero:[713,124,479,468], avatar:[1345,13,27,27],
    'model-cover':[420,164,187,83],
    'thumb-1':[749,618,68,57], 'thumb-2':[831,618,68,57],
    'thumb-3':[913,618,68,57], 'thumb-4':[996,618,68,57], 'thumb-5':[1079,618,68,57],
    'file-1':[1241,471,63,62], 'file-2':[1241,557,63,62],
    'file-3':[1241,645,63,62], 'file-4':[1241,732,63,62], 'file-5':[1241,821,63,62],
  };
  for(const [name,[left,top,width,height]] of Object.entries(crops)) {
    await sharp(input).extract({left,top,width,height}).webp({quality:94}).toFile(path.join(__dirname,'assets',name+'.webp'));
  }
  // Remove only the transparent outer margin; preserve alpha without flattening onto a background.
  const role = path.join(repo, 'apps/next/src/assets/icon/Nav/role.png');
  await sharp(role).trim({threshold:1}).resize({width:440,withoutEnlargement:true})
    .webp({lossless:true}).toFile(path.join(__dirname,'assets/sidebar.webp'));
}
async function main() {
  await cropAssets();
  let html=await fs.readFile(path.join(__dirname,'source.html'),'utf8');
  const styles=await fs.readFile(path.join(__dirname,'styles.css'),'utf8');
  const script=await fs.readFile(path.join(__dirname,'interactions.js'),'utf8');
  html=html.replaceAll(/<i data-icon="([^"]+)"><\/i>/g,(_,name)=>{
    if(!paths[name])throw Error('Unknown icon: '+name);
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
  });
  const candidates=[...(html+script).matchAll(/class="([^"]+)"/g)].flatMap(m=>m[1].split(/\s+/));
  const compiler=await compile('@import "tailwindcss";',{base:path.join(repo,'apps/next'),onDependency(){}});
  html=html.replace('/* CSS */',()=>compiler.build(candidates)+'\n'+styles).replace('/* SCRIPT */',()=>script);
  for(const name of await fs.readdir(path.join(__dirname,'assets'))) {
    if(!name.endsWith('.webp'))continue;
    const image=await fs.readFile(path.join(__dirname,'assets',name));
    html=html.replaceAll('assets/'+name,'data:image/webp;base64,'+image.toString('base64'));
  }
  await fs.writeFile(path.join(__dirname,'index.html'),html);
  console.log('Built standalone Tailwind CSS preview:',Buffer.byteLength(html),'bytes');
}
main().catch(error=>{console.error(error);process.exitCode=1});
