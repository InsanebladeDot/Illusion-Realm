// Local UI reference: no account, upload or generation requests leave the page.
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const on = (selector, event, handler) => $(selector).addEventListener(event, handler);
  const gallery = ['assets/hero.webp', 'assets/thumb-2.webp', 'assets/thumb-3.webp', 'assets/thumb-4.webp', 'assets/thumb-5.webp'];
  const fileImages = ['assets/file-1.webp', 'assets/file-2.webp', 'assets/file-3.webp', 'assets/file-4.webp', 'assets/file-5.webp'];
  const files = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1, name: `ComfyUI_000${String(21 - i).padStart(2, '0')}_.png`,
    folder: i < 8 ? 'test' : 'albion', src: fileImages[i % 5],
    meta: '截图样例 · 2026-10-21', order: 12 - i, favorite: i === 1,
  }));
  const state = { gallery: 0, folder: 'all', page: 1, ascending: false, favorites: false, selected: 1, seed: 42 };
  const objectUrls = [];
  let toastTimer, busy = false;
  const dialog = $('#app-dialog');

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3400);
  }
  function openDialog(title, viewer = false) {
    if (dialog.open) dialog.close();
    $('#dialog-title').textContent = title;
    $('#dialog-body').replaceChildren();
    dialog.classList.toggle('viewer-dialog', viewer);
    dialog.showModal();
    return $('#dialog-body');
  }
  function info(title, message) {
    openDialog(title).append(element('p', '', message));
  }
  function choices(title, items, action) {
    const body = openDialog(title);
    items.forEach(item => {
      const button = element('button', 'dialog-choice', item);
      button.type = 'button';
      button.addEventListener('click', () => { dialog.close(); action(item); });
      body.append(button);
    });
  }
  function download(src, name) {
    const link = element('a');
    link.href = src;
    link.download = name;
    link.click();
  }
  function viewImage(src, title) {
    const body = openDialog(title, true);
    const toolbar = element('div', 'dialog-toolbar');
    const button = element('button', 'dialog-action', '下载图片');
    button.type = 'button';
    button.addEventListener('click', () => download(src, 'illusion-reference.webp'));
    const image = element('img', 'dialog-preview');
    image.src = src;
    image.alt = title;
    toolbar.append(button);
    body.append(toolbar, image);
  }
  on('#close-dialog', 'click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  on('#theme-toggle', 'click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('#theme-toggle').setAttribute('aria-label', dark ? '切换浅色主题' : '切换深色主题');
  });
  on('#notifications', 'click', () => info('通知', '暂无新通知。这是独立的页面交互样例。'));
  on('#settings', 'click', () => choices('外观设置', ['浅色主题', '深色主题'], item => {
    document.documentElement.dataset.theme = item === '深色主题' ? 'dark' : 'light';
    $('#theme-toggle').setAttribute('aria-label', item === '深色主题' ? '切换浅色主题' : '切换深色主题');
  }));
  on('#account-menu', 'click', () => info('游客模式', '当前页面不接入账号系统。输入和上传的图片仅在本次页面会话中使用，刷新后清空。'));

  function switchPane(view) {
    document.body.dataset.mobileView = view;
    $$('.mobile-tabs [data-mobile]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.mobile === view)));
    const overlay = view === 'files' && matchMedia('(min-width:821px) and (max-width:1179px)').matches;
    $('#file-panel').classList.toggle('is-open', overlay);
    $('#library-backdrop').hidden = !overlay;
  }
  $$('[data-mobile]').forEach(button => button.addEventListener('click', () => switchPane(button.dataset.mobile)));
  on('#close-library', 'click', () => switchPane('edit'));
  on('#library-backdrop', 'click', () => switchPane('edit'));
  window.addEventListener('resize', () => switchPane(document.body.dataset.mobileView));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') switchPane('edit');
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !dialog.open) {
      event.preventDefault(); $('#generate').click();
    }
  });
  $$('[data-nav]').forEach(button => button.addEventListener('click', () => {
    const name = button.dataset.nav;
    if (name === '创作') return switchPane('edit');
    if (name === '收藏夹') {
      state.favorites = !state.favorites;
      state.page = 1;
      button.classList.toggle('active', state.favorites);
      button.setAttribute('aria-pressed', String(state.favorites));
      renderFiles(); switchPane('files');
      return toast(state.favorites ? '正在查看已收藏的样例，再次点击可显示全部' : '已显示全部文件');
    }
    if (name === '本地解析') return $('#file-input').click();
    info(name, `${name}不在本次创作页样例范围中。当前已实现提示词编辑、图片预览、文件搜索与本地导入。`);
  }));
  $$('[data-mode]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.mode !== '图片') info(`${button.dataset.mode}模式`, '本次样例还原图片创作工作区，其他创作模式保留入口，尚未接入。');
  }));
  $$('[data-collapse]').forEach(button => button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.collapse);
    target.hidden = !target.hidden;
    button.setAttribute('aria-expanded', String(!target.hidden));
    button.style.transform = target.hidden ? 'rotate(180deg)' : '';
  }));
  const help = {
    '模型选择': '模型封面来自参考截图。切换选项只改变本地表单，不会下载或调用模型。',
    '提示词': '描述主体、外观、动作、场景与光线。下方工具可插入示例词，最多 2000 字符。',
    '反向提示词': '填写希望减少的画面特征。预设仅用于示范编辑行为，实际效果取决于所用模型。',
    '预览': '点击主图查看大图；缩略图与工具栏支持切换和放大。素材裁切自截图，部分缩略图清晰度有限。',
  };
  $$('[data-help]').forEach(button => button.addEventListener('click', () => info(button.dataset.help, help[button.dataset.help])));
  on('#model-select', 'click', () => choices('选择模型 · 本地样例', ['anima aesthetic V11', 'anima · 示例模型 B'], name => {
    $('#model-name').textContent = name;
    $('#model-select').setAttribute('aria-label', `选择模型，当前 ${name}`);
  }));
  on('#prompt-guide', 'click', () => info('提示词写法参考', '推荐顺序：主体 → 外观与服装 → 动作与表情 → 场景 → 光线与画面风格。例如：1girl, blue hair, white dress, flower garden, soft lighting。示例并不保证模型输出效果。'));

  function updateCounts() {
    $('#prompt-count').textContent = $('#prompt').value.length;
    $('#negative-count').textContent = $('#negative').value.length;
  }
  function appendPrompt(text) {
    const input = $('#prompt');
    const separator = input.value.trim() ? ', ' : '';
    input.value = (input.value.trim() + separator + text).slice(0, 2000);
    updateCounts();
    input.focus();
  }
  function toggleSwitch(button) {
    const enabled = button.getAttribute('aria-checked') !== 'true';
    button.setAttribute('aria-checked', String(enabled));
    return enabled;
  }
  const suggestions = ['1girl', 'blue hair', 'flower garden', 'soft lighting'];
  const suggestionBox = element('div', 'suggestions');
  suggestionBox.hidden = true;
  suggestions.forEach(text => {
    const button = element('button', 'prompt-chip', text);
    button.type = 'button';
    button.addEventListener('click', () => { appendPrompt(text); suggestionBox.hidden = true; });
    suggestionBox.append(button);
  });
  $('.prompt-tools').before(suggestionBox);
  on('#prompt', 'input', () => {
    updateCounts();
    suggestionBox.hidden = !$('#prompt').value.trim() || $('#autocomplete').getAttribute('aria-checked') !== 'true';
  });
  on('#negative', 'input', updateCounts);
  on('#autocomplete', 'click', () => {
    const enabled = toggleSwitch($('#autocomplete'));
    suggestionBox.hidden = !enabled || !$('#prompt').value.trim();
  });
  const advancedNote = element('p', 'form-note', '高级示例：(blue hair:1.2) 表示权重；具体语法请以实际模型支持为准。');
  advancedNote.hidden = true;
  $('#prompt-content').append(advancedNote);
  on('#advanced', 'click', () => { advancedNote.hidden = !toggleSwitch($('#advanced')); });
  const toolWords = {
    '人物': ['1girl', 'blue hair', 'long hair'], '动作': ['standing', 'looking at viewer', 'walking'],
    '服饰': ['white dress', 'ribbon', 'school uniform'], '背景': ['flower garden', 'blue sky', 'fantasy landscape'],
    '表情': ['smile', 'gentle expression', 'closed eyes'], '3D 视角': ['front view', 'side view', 'from above'],
  };
  $$('[data-tool]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.tool === '图片') return $('#file-input').click();
    choices(`${button.dataset.tool} · 插入示例词`, toolWords[button.dataset.tool], appendPrompt);
  }));
  on('#assemble', 'click', () => choices('提示词组合模板', [
    '1girl, blue hair, white dress, flower garden, soft lighting',
    'fantasy landscape, floating island, clouds, sunset, wide shot',
    'portrait, gentle expression, blue flowers, soft lighting',
  ], appendPrompt));
  on('#negative-presets', 'click', () => choices('反向提示词预设', ['基础质量', '质量与手部', '清空预设'], name => {
    $('#preset-label').textContent = name;
    $('#negative').value = name === '清空预设' ? '' : name === '基础质量' ? 'worst quality, low quality, lowres, jpeg artifacts' : 'worst quality, low quality, bad anatomy, bad hands, missing fingers, extra fingers';
    updateCounts();
  }));
  on('#dimensions-toggle', 'click', () => {
    $('#dimension-fields').hidden = !$('#dimension-fields').hidden;
    $('#dimensions-toggle').setAttribute('aria-expanded', String(!$('#dimension-fields').hidden));
  });
  function updateDimensions() {
    for (const id of ['#image-width', '#image-height']) {
      const value = Number($(id).value) || 1024;
      $(id).value = Math.max(256, Math.min(2048, Math.round(value / 8) * 8));
    }
    $('#dimension-label').textContent = `${$('#image-width').value} × ${$('#image-height').value}`;
  }
  on('#ratio', 'change', () => {
    const dimensions = { '1:1':[1024,1024], '2:3':[832,1248], '3:2':[1248,832], '16:9':[1408,792], '9:16':[792,1408] };
    const [width, height] = dimensions[$('#ratio').value];
    $('#image-width').value = width; $('#image-height').value = height; updateDimensions();
  });
  ['#image-width', '#image-height'].forEach(id => on(id, 'change', updateDimensions));
  on('#random-seed', 'click', () => {
    state.seed = crypto.getRandomValues(new Uint32Array(1))[0];
    $('#random-seed').title = `当前随机种子：${state.seed}`;
    toast(`当前演示种子：${state.seed}`);
  });
  on('#generate', 'click', () => {
    if (busy) return;
    if (!$('#prompt').value.trim()) { $('#prompt').focus(); return toast('请先输入提示词，或用“组合”插入一个示例。'); }
    busy = true;
    $('#generate').disabled = true;
    $('#generate-label').textContent = '演示处理中…';
    setTimeout(() => {
      $('#result-image').src = $('#hero').src;
      $('#result-empty').hidden = true;
      $('#result-content').hidden = false;
      $('#generate').disabled = false;
      $('#generate-label').textContent = '生成';
      busy = false;
      switchPane('preview');
      $('#result-area').scrollIntoView({ block: 'nearest' });
      toast('演示完成：复用参考图片，未调用 AI 生成服务。');
    }, 850);
  });
  on('#download-result', 'click', () => download($('#result-image').src, 'illusion-demo.webp'));

  function selectImage(index) {
    state.gallery = (index + gallery.length) % gallery.length;
    $('#hero').src = gallery[state.gallery];
    $('#hero').alt = `参考截图图片 ${state.gallery + 1}`;
    $$('[data-gallery]').forEach(button => {
      const selected = Number(button.dataset.gallery) === state.gallery;
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
    });
  }
  $$('[data-gallery]').forEach(button => button.addEventListener('click', () => selectImage(Number(button.dataset.gallery))));
  on('#previous-image', 'click', () => selectImage(state.gallery - 1));
  on('#next-image', 'click', () => selectImage(state.gallery + 1));
  on('#hero-trigger', 'click', () => viewImage($('#hero').src, '参考图片 · 截图裁切素材'));
  on('#fullscreen', 'click', () => viewImage($('#hero').src, '大图查看 · 截图裁切素材'));
  const updateZoom = () => $('.hero-frame').style.setProperty('--zoom', $('#zoom').value);
  on('#zoom', 'change', updateZoom);
  on('#zoom-in', 'click', () => {
    $('#zoom').selectedIndex = ($('#zoom').selectedIndex + 1) % $('#zoom').options.length;
    updateZoom();
  });

  function filteredFiles() {
    const query = $('#file-search').value.trim().toLowerCase();
    return files.filter(file => (state.folder === 'all' || file.folder === state.folder) &&
      (!state.favorites || file.favorite) && (file.name + ' ' + file.folder).toLowerCase().includes(query))
      .sort((a,b) => state.ascending ? a.order - b.order : b.order - a.order);
  }
  function fileActions(file) {
    choices(file.name, [file.favorite ? '取消收藏' : '收藏', '查看大图', '下载图片'], action => {
      if (action === '查看大图') return viewImage(file.src, file.name);
      if (action === '下载图片') return download(file.src, file.src.startsWith('blob:') ? file.name : 'screenshot-sample.webp');
      file.favorite = !file.favorite;
      renderFiles(); toast(file.favorite ? '已收藏' : '已取消收藏');
    });
  }
  function fileCard(file) {
    const card = element('article', 'file-card');
    const thumb = element('button', 'file-thumb'); thumb.type = 'button'; thumb.setAttribute('aria-label', `查看 ${file.name}`);
    const img = element('img'); img.src = file.src; img.alt = ''; img.loading = 'lazy'; thumb.append(img);
    const body = element('div', 'file-info');
    const name = element('button', 'file-name', (file.favorite ? '♡ ' : '') + file.name); name.type = 'button'; name.title = file.name;
    body.append(name, element('p', 'file-meta', file.meta));
    const more = element('button', 'file-more', '⋮'); more.type = 'button'; more.setAttribute('aria-label', `${file.name} 更多操作`);
    [thumb, name].forEach(button => button.addEventListener('click', () => { state.selected = file.id; viewImage(file.src, file.name); }));
    more.addEventListener('click', () => fileActions(file));
    card.append(thumb, body, more); return card;
  }
  function renderFiles() {
    const filtered = filteredFiles();
    const pages = Math.max(1, Math.ceil(filtered.length / 6));
    state.page = Math.max(1, Math.min(state.page, pages));
    const visible = filtered.slice((state.page - 1) * 6, state.page * 6);
    $('#file-list').replaceChildren(...visible.map(fileCard));
    if (!visible.length) $('#file-list').append(element('p', 'file-empty', '没有符合条件的文件。试试其他关键词或文件夹。'));
    $('#file-total').textContent = `共 ${filtered.length} 个文件${state.favorites ? ' · 已收藏' : ''}`;
    $('#page-label').textContent = `${state.page} / ${pages}`;
    $('#previous-page').disabled = state.page === 1; $('#next-page').disabled = state.page === pages;
    $('#count-all').textContent = files.length;
    $('#count-test').textContent = files.filter(file => file.folder === 'test').length;
    $('#count-albion').textContent = files.filter(file => file.folder === 'albion').length;
    $$('[data-folder]').forEach(button => {
      const selected = button.dataset.folder === state.folder;
      button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
    });
  }
  function chooseFolder(folder) { state.folder = folder; state.page = 1; renderFiles(); }
  $$('[data-folder]').forEach(button => button.addEventListener('click', () => chooseFolder(button.dataset.folder)));
  on('#focus-search', 'click', () => $('#file-search').focus());
  on('#file-search', 'input', () => { state.page = 1; renderFiles(); });
  on('#previous-page', 'click', () => { state.page--; renderFiles(); });
  on('#next-page', 'click', () => { state.page++; renderFiles(); });
  on('#sort-files', 'click', () => {
    state.ascending = !state.ascending;
    $('#sort-label').textContent = state.ascending ? '修改时间：正序' : '按修改时间'; renderFiles();
  });
  ['grid', 'list'].forEach(view => on(`#view-${view}`, 'click', () => {
    $('#file-list').dataset.view = view;
    ['grid', 'list'].forEach(name => {
      $(`#view-${name}`).classList.toggle('active', name === view);
      $(`#view-${name}`).setAttribute('aria-pressed', String(name === view));
    });
  }));
  on('#file-preview', 'click', () => {
    const candidates = filteredFiles();
    const file = candidates.find(item => item.id === state.selected) || candidates[0];
    if (file) viewImage(file.src, file.name); else toast('当前没有可以预览的文件。');
  });
  on('#new-folder', 'click', () => {
    const body = openDialog('新建文件夹');
    const form = element('form');
    const label = element('label', '', '文件夹名称'); label.htmlFor = 'folder-name';
    const input = element('input', 'thin-input dialog-input'); input.id = 'folder-name'; input.required = true; input.maxLength = 30;
    const submit = element('button', 'dialog-action', '创建'); submit.type = 'submit';
    form.append(label, input, element('p', 'form-note', '仅保存在本次演示会话中。'), submit); body.append(form); input.focus();
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!input.value.trim()) return;
      const id = `custom-${Date.now()}`;
      const button = element('button', 'folder', input.value.trim()); button.type = 'button'; button.dataset.folder = id;
      button.addEventListener('click', () => chooseFolder(id));
      $('#custom-folders').append(button); dialog.close(); chooseFolder(id);
    });
  });
  ['#upload', '#upload-more'].forEach(id => on(id, 'click', () => $('#file-input').click()));
  on('#file-input', 'change', async event => {
    try {
      const incoming = [...event.target.files].filter(file => file.type.startsWith('image/'));
      for (const file of incoming) {
        const src = URL.createObjectURL(file); objectUrls.push(src);
        const id = Date.now() + files.length;
        files.push({ id, name: file.name, folder: state.folder === 'all' ? 'test' : state.folder, src, meta: `本地导入 · ${(file.size / 1024).toFixed(1)} KB`, order: id, favorite: false });
      }
      state.page = 1; state.ascending = false; state.favorites = false;
      $('[data-nav="收藏夹"]').classList.remove('active');
      $('#sort-label').textContent = '按修改时间';
      renderFiles(); switchPane('files');
      toast(incoming.length ? `已本地导入 ${incoming.length} 张图片；刷新后清空。` : '请选择图片文件。');
    } catch { toast('图片导入失败，请重新选择。'); }
    finally { event.target.value = ''; }
  });
  window.addEventListener('beforeunload', () => objectUrls.forEach(url => URL.revokeObjectURL(url)));
  updateCounts(); renderFiles();
})();
