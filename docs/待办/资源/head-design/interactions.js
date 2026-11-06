/* 这个原型只验证信息层级和操作反馈，不调用项目 IPC、扫描器或窗口接口。
 * 数据像菜单菜谱：同一个渲染方法读取不同参数，得到统一但内容不同的控件。
 * stable id 负责选择身份，筛选和排序后不会把选中态错给另一张 Card。
 * 所有提示明确写“设计预览”，避免把计时器模拟误认成真实任务。 */
const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
/* 查询参数只服务截图验收，让深色预览不依赖自动点击的时间点。
 * 没有参数时仍按浅色首屏开始，用户可用外观按钮切换。
 * 非法值被忽略，不会写入存储或污染项目真实主题偏好。 */
const previewTheme=new URLSearchParams(location.search).get('theme');if(['light','dark'].includes(previewTheme))document.documentElement.dataset.theme=previewTheme;
/* 全局 head 只配置跨页面动作；模型扫描不在这里注册。
 * icon 对应页面中唯一的 symbol，新增入口无需复制 SVG 路径。
 * count 为零时不渲染角标，避免空徽标干扰视觉。
 * action 只用于本地演示分派，不代表真实 Electron 通道。 */
const globalActions=[{id:'appearance',icon:'palette',label:'切换外观'},{id:'tasks',icon:'images',label:'生成任务',count:2},{id:'downloads',icon:'download',label:'下载中心',count:1},{id:'more',icon:'more',label:'更多全局工具'}];
/* 应用导航复用一行结构，当前路由由 active 参数表达。
 * 这里保留项目核心入口，模型库属于工具域而不是第二套顶栏导航。
 * 原型点击只切换高亮并提示，不执行真实路由跳转。 */
const navItems=[['首页','sparkle'],['创建','images'],['Agent','sparkle'],['本地解析','search'],['工具与模型','folder']];
/* 模型与目录使用项目已有 Anima 资产，只做可视化占位。
 * 业务字段先适配成 Card 展示模型，Card 本身不读取扫描目录。
 * cover 使用仓库相对路径，离线打开和仓库根预览都可解析。
 * 详情和列表读取同一对象，避免标题与封面来自两份假数据。 */
const models=[{id:'aesthetic',name:'Anima Aesthetic V1.1',meta:'Checkpoint · 6.4 GB',cover:'../../../../apps/next/src/assets/icon/create/models/anima-preview2.webp'},{id:'office',name:'Anima Office Style',meta:'LoRA · 428 MB',cover:'../../../../apps/next/src/assets/icon/create/models/anima-official-base.webp'},{id:'cinema',name:'Anima Cinematic Light',meta:'LoRA · 312 MB',cover:'../../../../apps/next/src/assets/icon/create/models/anima-preview3.webp'},{id:'pony',name:'T-Pony NAI3',meta:'Checkpoint · 6.1 GB',cover:'../../../../apps/next/src/assets/icon/create/models/t-ponynai3.webp'},{id:'noob',name:'NoobAI XL',meta:'Checkpoint · 6.5 GB',cover:'../../../../apps/next/src/assets/icon/create/models/noobai-xl.webp'},{id:'dream',name:'Dreambox Mix',meta:'Checkpoint · 5.9 GB',cover:'../../../../apps/next/src/assets/icon/create/models/dreambox.webp'}];
/* 目录参数只描述名称、数量和当前项，渲染器统一处理图标与截断。
 * 数量来自设计示例，不写进模型数组推导，避免冒充真实扫描统计。
 * 点击目录更新面包屑和当前态，但不会偷偷更换硬盘路径。 */
const folders=[{id:'all',name:'全部模型',count:82},{id:'checkpoint',name:'Checkpoints',count:28},{id:'lora',name:'LoRA',count:41},{id:'anima',name:'Anima SDXL',count:13,active:true},{id:'office',name:'Anima Office',count:6}];
let selectedId='aesthetic',toastTimer,scanning=false;
/* icon 只负责拼出 symbol 引用，按钮的可访问名称由调用方提供。
 * 共享函数让 head、目录与列表使用同一图标尺寸规则。 */
function icon(name){return `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`}
/* 全局按钮共享尺寸、角标和点击入口；业务反馈按 id 在单一分派点处理。
 * 类比一排相同插座：外壳规格相同，接入的工具仍各做各的事。 */
function renderGlobalActions(){$('#global-actions').innerHTML=globalActions.map(item=>`<button class="head-button h-full w-11 rounded-none" data-global="${item.id}" aria-label="${item.label}" title="${item.label}">${icon(item.icon)}${item.count?`<span class="task-count">${item.count}</span>`:''}</button>`).join('')}
/* nav 只渲染统一行；当前页高亮不触碰模型卡片的 selectedId。
 * 点击反馈说明它是预览，用户不会误以为浏览器原型已完成路由。 */
function renderNav(){$('#nav-items').innerHTML=navItems.map(([label,mark],index)=>`<button class="nav-item ${index===4?'active':''}" data-nav="${label}">${icon(mark)}<span class="nav-label text-xs">${label}</span></button>`).join('')}
/* 面包屑保留起点、折叠层和当前目录三段，长路径不会挤掉扫描按钮。
 * 上级按钮可以回到对应演示层级，当前层使用 aria-current 表明位置。 */
function renderBreadcrumb(current='Anima Office'){$('#breadcrumb').innerHTML=`<button class="crumb" data-crumb="我的分类">我的分类</button>${icon('chevron')}<button class="crumb" data-crumb="Anima SDXL">Anima SDXL</button>${icon('chevron')}<button class="crumb current" aria-current="page" title="${current}">${current}</button>`}
/* 目录点击只变更视图参数，不执行扫描或磁盘写入。
 * active 通过稳定 id 比较，重新渲染不会因数组位置改变而错位。 */
function renderFolders(activeId='office'){$('#folder-tree').innerHTML=folders.map(folder=>`<button class="folder-item ${folder.id===activeId?'active':''}" data-folder="${folder.id}">${icon('folder')}<span>${folder.name}</span><small>${folder.count}</small></button>`).join('')}
/* Card 复用相同 HTML 结构，内容、选中态与事件身份由参数注入。
 * 搜索只过滤展示数组，不修改原始模型和当前详情数据。
 * 图片 alt 使用模型名称，缺图时浏览器仍保留可理解文本。 */
function renderModels(query=''){const needle=query.trim().toLowerCase(),visible=models.filter(model=>model.name.toLowerCase().includes(needle));$('#model-grid').innerHTML=visible.map(model=>`<button class="model-card ${model.id===selectedId?'selected':''}" data-model="${model.id}"><img src="${model.cover}" alt="${model.name}"><div><h3>${model.name}</h3><p>${model.meta}</p></div></button>`).join('')||'<p class="col-span-full py-12 text-center text-xs text-muted">没有匹配的模型</p>'}
/* 详情读取同一展示对象，避免 Card 和详情各维护一套名称与封面。
 * 找不到 id 时保持旧详情，不制造空指针错误或错误成功反馈。 */
function renderDetails(){const model=models.find(item=>item.id===selectedId);if(!model)return;$('#detail-cover').src=model.cover;$('#detail-cover').alt=model.name;$('#detail-name').textContent=model.name;$('#detail-meta').textContent=model.meta+' · 本地模型'}
/* toast 每次覆盖旧消息并重置计时器，连续点击不会叠出多层提示。
 * 计时器只控制界面说明，不修改模型或扫描状态。 */
function showToast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>{$('#toast').hidden=true},2200)}
/* popover 复用同一容器；打开新内容前先关闭旧内容。
 * 内容都是固定设计文案，不拼接用户输入，因此不会解释动态 HTML。 */
function showPopover(title,body){const node=$('#popover');node.innerHTML=`<strong class="text-xs">${title}</strong><p class="mt-2 leading-5 text-muted">${body}</p>`;node.hidden=false}
/* 扫描动效模拟异步状态：按钮禁用、图标旋转、状态文字同步出现。
 * 像试车台上的指示灯，它只展示操作节奏，不表示真实磁盘已经被读取。
 * finally 对应的计时回调恢复按钮，失败路径留给正式业务实现。 */
function previewScan(button){if(scanning)return;scanning=true;button.disabled=true;button.querySelector('svg').classList.add('spinning');button.querySelector('span').textContent='扫描中';$('#scan-state').hidden=false;$('#scan-state').textContent='正在读取模型目录…';$('#footer-status').textContent='设计预览 · 模拟扫描';setTimeout(()=>{scanning=false;button.disabled=false;button.querySelector('svg').classList.remove('spinning');button.querySelector('span').textContent='重新扫描';$('#scan-state').textContent='索引已更新';$('#footer-status').textContent='工作区已就绪';showToast('设计预览：扫描状态已完成')},1400)}
/* head 和页面工具使用事件代理，动态渲染后不必重新绑定每个按钮。
 * 不同 data 属性保持职责分离，避免一个通用 switch 接管所有业务。 */
document.addEventListener('click',event=>{const target=event.target.closest('button');if(!target){$('#popover').hidden=true;return}if(target.dataset.action==='sidebar'){$('#app-nav').classList.toggle('collapsed');$('#main').classList.toggle('nav-collapsed');target.classList.toggle('active');return}if(target.dataset.action==='scan'){previewScan(target);return}if(target.dataset.global==='appearance'){document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';target.classList.toggle('active');return}if(target.dataset.global){showPopover(target.title,target.dataset.global==='tasks'?'2 个生成任务正在运行。':'这是全局工具区的设计预览。');return}if(target.dataset.action==='account'){showPopover('guest','账户、设置与退出登录统一收在这里。');return}if(target.dataset.action==='folders'){showToast('设计预览：打开扫描目录设置');return}if(target.dataset.action==='page-menu'){showPopover('模型库操作','导入索引、帮助等低频页面操作放在这里。');return}if(target.dataset.window){showToast(`设计预览：窗口${{min:'最小化',max:'最大化',close:'关闭'}[target.dataset.window]}`);return}if(target.dataset.nav){$$('[data-nav]').forEach(item=>item.classList.toggle('active',item===target));showToast(`设计预览：${target.dataset.nav}`);return}if(target.dataset.crumb){renderBreadcrumb(target.dataset.crumb);showToast(`返回 ${target.dataset.crumb}`);return}if(target.dataset.folder){renderFolders(target.dataset.folder);renderBreadcrumb(folders.find(item=>item.id===target.dataset.folder)?.name||'当前目录');return}if(target.dataset.model){selectedId=target.dataset.model;renderModels($('#search').value);renderDetails();return}if(target.dataset.view){$$('[data-view]').forEach(item=>item.classList.toggle('active',item===target));$('#model-grid').classList.toggle('list',target.dataset.view==='list')}});
/* 搜索只更新可见 Card；详情保留当前选择，清空搜索后仍能回到原模型。
 * Escape 关闭浮层，符合桌面应用的常见键盘路径。 */
$('#search').addEventListener('input',event=>renderModels(event.currentTarget.value));document.addEventListener('keydown',event=>{if(event.key==='Escape')$('#popover').hidden=true});
/* 初始化顺序先建立公共控件，再填充依赖 selectedId 的模型详情。
 * 每个渲染器只接收自己需要的参数，避免读取一份巨大全局配置。 */
renderGlobalActions();renderNav();renderBreadcrumb();renderFolders();renderModels();renderDetails();
