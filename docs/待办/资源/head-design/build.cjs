/* 构建器把 Tailwind CSS 4、HTML 和交互脚本合成一个 index.html。
 * 这样交付物可直接打开，预览时不依赖 CDN、字体或图标服务。
 * 源文件保留结构与注释，生成文件只作为可运行产物，不手工维护。
 * 类比印刷排版：source 是原稿，index 是装订好的成品，两者职责分开。 */
const fs=require('node:fs/promises'),path=require('node:path'),{createRequire}=require('node:module');
/* 从 Next 包解析已有 Tailwind 插件，不给仓库增加第二套依赖。
 * postcss 从插件自己的依赖树读取，适配 pnpm 的隔离目录结构。
 * 编译输入明确指向本原型，避免扫描整仓库造成无关 CSS 膨胀。 */
const nextRequire=createRequire(path.resolve(__dirname,'../../../../apps/next/package.json'));
const plugin=nextRequire('@tailwindcss/postcss'),postcss=createRequire(nextRequire.resolve('@tailwindcss/postcss'))('postcss');
/* 失败直接让进程以非零状态结束，不生成看似成功的半成品。
 * replace 使用固定占位符，若原稿丢失标记则显式报错。
 * CSS 中的 style 结束标签做转义，避免意外提前关闭内嵌样式。 */
async function build(){const [html,css,script]=await Promise.all(['source.html','styles.css','interactions.js'].map(name=>fs.readFile(path.join(__dirname,name),'utf8')));if(!html.includes('/* CSS */')||!html.includes('/* SCRIPT */'))throw Error('source.html 缺少构建占位符');const result=await postcss([plugin()]).process(css,{from:path.join(__dirname,'styles.css')});const output=html.replace('/* CSS */',()=>result.css.replace(/<\/style/gi,'<\\/style')).replace('/* SCRIPT */',()=>script.replace(/<\/script/gi,'<\\/script'));await fs.writeFile(path.join(__dirname,'index.html'),output);console.log(`head-design/index.html: ${Buffer.byteLength(output)} bytes`)}
/* 顶层 catch 保留完整错误供本地排查，同时设置失败退出码供自动化判断。 */
/* 构建只覆盖同目录的演示产物，不读取或改写正式 Next.js 页面。 */
/* 输出保留原稿中的无障碍属性和区域注释，方便单文件交付后继续检查。 */
/* 重新构建是幂等操作：输入不变时生成的界面内容也保持不变。 */
build().catch(error=>{console.error(error);process.exitCode=1});
