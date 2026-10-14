"use strict";

(() => {
  const M = window.ComicDemoModel;
  const $ = id => document.getElementById(id);
  const ctx = $("page").getContext("2d", { willReadFrequently: true });
  const guide = $("guides").getContext("2d");
  const key = "ir-comic-workbench-demo-v1";
  const images = new Map();
  const undo = [], redo = [];
  let state = M.initial(), selected = "a", boxes, shapes;
  let showPath = false, shapeEditing = false, layoutEditing = false, activeVertex = -1;
  let gesture = null, layoutGesture = null, shapeGesture = null, layoutPointerStart = null, saveTimer, toastTimer;
  window.demoErrors = [];
  window.addEventListener("error", event => window.demoErrors.push(event.message));
  window.addEventListener("unhandledrejection", event => window.demoErrors.push(String(event.reason)));
  const current = () => state.panels.find(p => p.id === selected);

  function notice(message) {
    $("status").textContent = message;
    $("status").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $("status").hidden = true; }, 4500);
  }
  function restore() {
    try {
      const value = localStorage.getItem(key);
      if (!value) return;
      const draft = JSON.parse(value);
      if (!M.validate(draft)) throw Error("草稿格式不可用");
      delete draft.geometry;
      state = draft; selected = state.order[0];
      $("save-state").textContent = "已恢复本机草稿";
    } catch { notice("本机草稿不可用，已载入示例"); }
  }
  function save() {
    clearTimeout(saveTimer);
    $("save-state").textContent = "保存中";
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify(state)); $("save-state").textContent = "本机草稿已保存"; }
      catch { $("save-state").textContent = "保存失败，请导出项目"; }
    }, 350);
  }
  function record(previous) {
    if (JSON.stringify(previous) === JSON.stringify(state)) return;
    undo.push(previous); if (undo.length > 40) undo.shift(); redo.length = 0;
    save(); render();
  }
  function transact(callback) {
    const previous = structuredClone(state);
    try {
      callback();
      if (!M.validate(state)) throw Error("格子过小或布局不合法，本次操作未应用");
      record(previous);
    } catch (error) { state = previous; document.activeElement.blur(); notice(error.message); render(); }
  }
  function edit(callback) {
    if (current().locked) { notice("当前格已锁定"); return; }
    transact(callback);
  }
  function navigate(view) {
    document.body.dataset.view = view;
    document.querySelectorAll(".mobile-tabs button").forEach(button => button.setAttribute("aria-pressed", button.dataset.view === view));
  }
  function select(id) {
    selected = id;
    render();
  }
  function polygon(box, panel) {
    if (panel.customVertices) return panel.customVertices.map(point => ({ x: box.x + point.x * box.width, y: box.y + point.y * box.height }));
    const points = [{ x: box.x, y: box.y }, { x: box.x + box.width, y: box.y },
      { x: box.x + box.width, y: box.y + box.height }, { x: box.x, y: box.y + box.height }];
    return panel.edge === "straight" ? points : window.createPhotoTear(points, panel.roughness, panel.seed,
      { preset: panel.edge, inwardOnly: true, generatorVersion: 2 });
  }
  function trace(context, vertices) {
    context.beginPath();
    vertices.forEach((v, i) => i ? context.lineTo(v.x, v.y) : context.moveTo(v.x, v.y));
    context.closePath();
  }
  function paper(panel, vertices) {
    if (panel.edge === "straight" || panel.edge === "impact") return;
    ctx.save(); trace(ctx, vertices); ctx.fillStyle = "#fff"; ctx.strokeStyle = "#fff";
    ctx.lineWidth = 12; ctx.lineJoin = "round";
    ctx.shadowColor = "#1e293b40"; ctx.shadowBlur = 9; ctx.shadowOffsetY = 5;
    ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function drawImage(panel, box) {
    const image = images.get(window.PROTOTYPE_DATA.images[panel.asset] || state.assets[panel.asset]);
    if (!image) {
      ctx.fillStyle = "#f2f5f5"; ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.fillStyle = "#89969c"; ctx.font = "28px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("空白分镜", box.x + box.width / 2, box.y + box.height / 2, box.width - 20);
      return;
    }
    const scale = Math.max(box.width / image.width, box.height / image.height) * panel.zoom;
    ctx.drawImage(image, box.x + (box.width - image.width * scale) * panel.focusX,
      box.y + (box.height - image.height * scale) * panel.focusY, image.width * scale, image.height * scale);
  }
  function drawPanel(panel) {
    const box = boxes.get(panel.id), vertices = shapes.get(panel.id);
    paper(panel, vertices);
    ctx.save(); trace(ctx, vertices); ctx.clip(); drawImage(panel, box); ctx.restore();
    if (panel.edge === "straight" || panel.edge === "impact") {
      trace(ctx, vertices); ctx.strokeStyle = "#262d31"; ctx.lineWidth = 3; ctx.stroke();
    }
  }
  function captionLines(text, width) {
    const lines = []; let line = "";
    for (const character of text) {
      if (character === "\n" || ctx.measureText(line + character).width > width) { lines.push(line); line = character === "\n" ? "" : character; }
      else line += character;
    }
    if (line) lines.push(line);
    return lines;
  }
  function drawCaption(panel) {
    if (!panel.caption) return;
    const box = boxes.get(panel.id), width = Math.min(390, box.width - 36);
    ctx.save(); ctx.font = "24px 'Microsoft YaHei', sans-serif";
    trace(ctx, shapes.get(panel.id)); ctx.clip();
    const lines = captionLines(panel.caption, width - 26);
    ctx.fillStyle = "#fffffff2"; ctx.strokeStyle = "#333"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(box.x + 14, box.y + 14, width, 22 + lines.length * 32); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#292d30"; ctx.textAlign = "left"; ctx.textBaseline = "top";
    lines.forEach((line, index) => ctx.fillText(line, box.x + 27, box.y + 25 + index * 32)); ctx.restore();
  }
  function drawGuides() {
    guide.clearRect(0, 0, 1200, 1600);
    const vertices = shapes.get(selected);
    if (vertices) { trace(guide, vertices); guide.strokeStyle = "#27865e"; guide.lineWidth = 6; guide.stroke(); }
    if (shapeEditing && vertices) {
      vertices.forEach((point, index) => {
        guide.beginPath(); guide.arc(point.x, point.y, index === activeVertex ? 13 : 10, 0, Math.PI * 2);
        guide.fillStyle = index === activeVertex ? "#ac3764" : "#fff"; guide.fill(); guide.strokeStyle = "#ac3764"; guide.lineWidth = 3; guide.stroke();
      });
    }
    if (layoutEditing) {
      const box = boxes.get(selected);
      guide.strokeStyle = "#ac3764"; guide.lineWidth = 5; guide.setLineDash([12, 8]); guide.strokeRect(box.x, box.y, box.width, box.height); guide.setLineDash([]);
      guide.fillStyle = "#ac3764"; guide.fillRect(box.x + box.width - 18, box.y + box.height - 18, 36, 36);
    }
    if (!showPath) return;
    const centers = state.order.map(id => { const b = boxes.get(id); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    centers.forEach((point, index) => {
      if (index) drawArrow(centers[index - 1], point);
      guide.beginPath(); guide.arc(point.x, point.y, 25, 0, Math.PI * 2);
      guide.fillStyle = "#fff"; guide.fill(); guide.strokeStyle = "#ac3764"; guide.lineWidth = 3; guide.stroke();
      guide.fillStyle = "#ac3764"; guide.font = "bold 24px sans-serif"; guide.textAlign = "center"; guide.textBaseline = "middle";
      guide.fillText(String(index + 1), point.x, point.y);
    });
  }
  function drawArrow(a, b) {
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    guide.beginPath(); guide.moveTo(a.x, a.y); guide.lineTo(b.x, b.y);
    guide.strokeStyle = "#ac3764cc"; guide.lineWidth = 5; guide.stroke();
    guide.beginPath(); guide.moveTo(b.x, b.y); guide.lineTo(b.x - 22 * Math.cos(angle - .4), b.y - 22 * Math.sin(angle - .4));
    guide.moveTo(b.x, b.y); guide.lineTo(b.x - 22 * Math.cos(angle + .4), b.y - 22 * Math.sin(angle + .4)); guide.stroke();
  }

  function localPoint(event, box) {
    const rect = $("page").getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, ((event.clientX - rect.left) * 1200 / rect.width - box.x) / box.width)),
      y: Math.max(0, Math.min(1, ((event.clientY - rect.top) * 1600 / rect.height - box.y) / box.height)) };
  }

  function rectangleVertices() {
    return [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  }

  function addAtNearestEdge(vertices, point) {
    let best = 0, distance = Infinity;
    vertices.forEach((item, index) => {
      const next = vertices[(index + 1) % vertices.length], dx = next.x - item.x, dy = next.y - item.y;
      const ratio = Math.max(0, Math.min(1, ((point.x - item.x) * dx + (point.y - item.y) * dy) / (dx * dx + dy * dy)));
      const distanceToEdge = (point.x - item.x - ratio * dx) ** 2 + (point.y - item.y - ratio * dy) ** 2;
      if (distanceToEdge < distance) { best = index; distance = distanceToEdge; }
    });
    vertices.splice(best + 1, 0, point);
  }

  function capturePointer(event) {
    try { $("page").setPointerCapture(event.pointerId); } catch { /* Synthetic test events have no active pointer. */ }
  }
  function renderList() {
    $("panel-list").replaceChildren();
    state.order.forEach((id, index) => {
      const panel = state.panels.find(p => p.id === id), button = document.createElement("button");
      button.className = "panel-item"; button.dataset.panel = id; button.setAttribute("aria-pressed", id === selected);
      const number = document.createElement("span"); number.className = "number"; number.textContent = String(index + 1).padStart(2, "0");
      const thumb = document.createElement(panel.asset ? "img" : "span");
      if (panel.asset) { thumb.src = window.PROTOTYPE_DATA.images[panel.asset] || state.assets[panel.asset]; thumb.alt = ""; }
      else thumb.className = "panel-empty";
      const copy = document.createElement("span"), title = document.createElement("strong"), detail = document.createElement("small");
      copy.className = "panel-copy"; title.textContent = panel.name || "未命名分镜";
      detail.textContent = (panel.locked ? "已锁定 · " : "") + (panel.edge === "straight" ? "直线格框" : window.TEAR_PRESETS[panel.edge].name);
      copy.append(title, detail); button.append(number, thumb, copy);
      button.addEventListener("click", () => select(id)); $("panel-list").append(button);
    });
    $("panel-count").textContent = `${state.panels.length} 格`;
  }
  function value(id, next) {
    const input = $(id);
    if (document.activeElement !== input || input.tagName === "SELECT" || input.type === "range") input.value = next;
  }
  function syncFields() {
    const p = current(), box = boxes.get(selected);
    $("settings-title").textContent = `${state.order.indexOf(selected) + 1} · ${p.name || "未命名"}`;
    $("panel-id").textContent = p.id.slice(0, 8);
    $("selection-label").textContent = `${state.order.indexOf(selected) + 1} · ${p.name || "未命名"}`;
    $("geometry-label").textContent = `${Math.round(box.width)} × ${Math.round(box.height)} px`;
    for (const [id, next] of [["project-title", state.title], ["template", state.template], ["gutter", state.gutter],
      ["panel-name", p.name], ["description", p.description], ["edge", p.edge], ["asset", p.asset || ""],
      ["focus-x", p.focusX * 100], ["focus-y", p.focusY * 100], ["zoom", p.zoom * 100], ["caption", p.caption], ["roughness", p.roughness]]) value(id, next);
    $("gutter-value").textContent = state.gutter + " px"; $("roughness-value").textContent = p.roughness + " px";
    $("zoom-value").textContent = Math.round(p.zoom * 100) + "%";
    $("vertex-value").textContent = `${p.customVertices ? p.customVertices.length : 4} 个顶点${shapeEditing ? " · 编辑中" : ""}`;
    $("undo").disabled = !undo.length; $("redo").disabled = !redo.length;
    for (const id of ["panel-name", "description", "asset", "focus-x", "focus-y", "zoom", "edge", "caption", "import-image", "split-x", "split-y", "merge", "edit-shape", "add-vertex", "remove-vertex", "reset-shape"]) $(id).disabled = p.locked;
    $("roughness").disabled = $("new-tear").disabled = p.locked || p.edge === "straight";
    $("lock-panel").innerHTML = window.DEMO_ICONS[p.locked ? "Lock" : "Unlock"];
    $("lock-panel").title = $("lock-panel").ariaLabel = p.locked ? "解锁当前格" : "锁定当前格";
    $("move-earlier").disabled = p.locked || state.order.indexOf(selected) === 0;
    $("move-later").disabled = p.locked || state.order.indexOf(selected) === state.order.length - 1;
    $("show-path").setAttribute("aria-pressed", showPath);
    $("edit-layout").disabled = state.layoutMode !== "custom";
    $("gutter").disabled = state.layoutMode === "custom";
    $("edit-layout").textContent = layoutEditing ? "完成排版调整" : "调整格子位置与尺寸";
    $("edit-shape").textContent = shapeEditing ? "完成形状编辑" : "编辑当前形状";
    syncBoundary(box);
  }
  function syncBoundary(box) {
    const old = $("boundary").value;
    $("boundary").replaceChildren();
    box.ancestors.forEach((node, index) => {
      const option = document.createElement("option"); option.value = node.id;
      option.textContent = `${index === 0 ? "整页" : "第 " + (index + 1) + " 层"} · ${node.axis === "x" ? "左右分界" : "上下分界"}`;
      $("boundary").append(option);
    });
    if (box.ancestors.some(n => n.id === old)) $("boundary").value = old;
    else if (box.ancestors.length) $("boundary").value = box.ancestors[box.ancestors.length - 1].id;
    const node = M.findNode(state.tree, $("boundary").value);
    $("boundary").disabled = $("boundary-position").disabled = !node;
    if (node) { value("boundary-position", node.ratio * 100); $("boundary-value").textContent = Math.round(node.ratio * 100) + "%"; }
  }
  function render() {
    if (!state.panels.some(p => p.id === selected)) selected = state.order[0];
    boxes = M.frames(state); shapes = new Map(state.panels.map(p => [p.id, polygon(boxes.get(p.id), p)]));
    ctx.clearRect(0, 0, 1200, 1600); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1200, 1600);
    state.panels.forEach(drawPanel); state.panels.forEach(drawCaption);
    drawGuides(); renderList(); syncAssetOptions(); syncFields();
  }
  function captionOverflow() {
    ctx.save(); ctx.font = "24px 'Microsoft YaHei', sans-serif";
    const overflow = state.panels.some(p => {
      const b = boxes.get(p.id);
      return p.caption && 50 + captionLines(p.caption, Math.min(390, b.width - 36) - 26).length * 32 > b.height;
    });
    ctx.restore(); return overflow;
  }
  function range(id, callback) {
    $(id).addEventListener("input", () => {
      gesture ??= structuredClone(state);
      const previous = structuredClone(state);
      try { callback(Number($(id).value)); if (!M.validate(state)) throw Error("边界超出最小格限制"); render(); }
      catch (error) { state = previous; notice(error.message); render(); }
    });
    $(id).addEventListener("change", () => { if (gesture) record(gesture); gesture = null; });
  }
  function reorder(delta) {
    edit(() => {
      const i = state.order.indexOf(selected), next = i + delta;
      if (next < 0 || next >= state.order.length) return;
      [state.order[i], state.order[next]] = [state.order[next], state.order[i]];
    });
  }
  function bindEdits() {
    for (const [id, field] of [["panel-name", "name"], ["description", "description"], ["caption", "caption"], ["edge", "edge"]])
      $(id).addEventListener("change", () => edit(() => { current()[field] = $(id).value; }));
    $("project-title").addEventListener("change", () => transact(() => { state.title = $("project-title").value; }));
    $("template").addEventListener("change", () => transact(() => M.template(state, $("template").value)));
    $("edit-layout").addEventListener("click", () => { if (state.layoutMode !== "custom") { notice("请先选择‘自定义排版’"); return; } layoutEditing = !layoutEditing; shapeEditing = false; render(); });
    range("gutter", v => { if (state.panels.some(p => p.locked)) throw Error("页面包含锁定格"); state.gutter = v; });
    range("boundary-position", v => {
      const node = M.findNode(state.tree, $("boundary").value);
      const affected = [...boxes].filter(([, b]) => b.ancestors.some(n => n.id === node.id)).map(([id]) => id);
      if (state.panels.some(p => p.locked && affected.includes(p.id))) throw Error("共享边界涉及锁定格");
      node.ratio = v / 100;
    });
    for (const [id, field, divisor] of [["focus-x", "focusX", 100], ["focus-y", "focusY", 100], ["zoom", "zoom", 100], ["roughness", "roughness", 1]])
      range(id, v => { if (current().locked) throw Error("当前格已锁定"); current()[field] = v / divisor; });
    $("boundary").addEventListener("change", () => syncBoundary(boxes.get(selected)));
    $("new-tear").addEventListener("click", () => edit(() => { current().seed = (current().seed + 104729) >>> 0; }));
    $("split-x").addEventListener("click", () => edit(() => M.split(state, selected, "x")));
    $("split-y").addEventListener("click", () => edit(() => M.split(state, selected, "y")));
    $("merge").addEventListener("click", () => edit(() => M.merge(state, selected)));
    $("move-earlier").addEventListener("click", () => reorder(-1)); $("move-later").addEventListener("click", () => reorder(1));
    $("lock-panel").addEventListener("click", () => transact(() => { current().locked = !current().locked; }));
    $("edit-shape").addEventListener("click", () => {
      if (current().locked) { notice("当前格已锁定"); return; }
      shapeEditing = !shapeEditing; layoutEditing = false;
      if (shapeEditing && !current().customVertices) transact(() => { current().customVertices = rectangleVertices(); });
      else render();
    });
    $("add-vertex").addEventListener("click", () => edit(() => {
      const vertices = current().customVertices || rectangleVertices();
      current().customVertices = vertices; addAtNearestEdge(vertices, { x: .5, y: .5 });
      shapeEditing = true; layoutEditing = false;
    }));
    $("remove-vertex").addEventListener("click", () => edit(() => {
      const vertices = current().customVertices || rectangleVertices();
      if (vertices.length <= 3) throw Error("多边形至少需要 3 个顶点");
      vertices.splice(activeVertex >= 0 ? activeVertex : vertices.length - 1, 1); current().customVertices = vertices;
    }));
    $("reset-shape").addEventListener("click", () => edit(() => { current().customVertices = null; shapeEditing = false; activeVertex = -1; }));
  }
  function bindNavigation() {
    document.querySelectorAll(".mobile-tabs button").forEach(button => button.addEventListener("click", () => navigate(button.dataset.view)));
    $("back-canvas").addEventListener("click", () => navigate("canvas"));
    $("show-path").addEventListener("click", () => { showPath = !showPath; drawGuides(); syncFields(); });
    $("fit-page").addEventListener("click", () => { document.querySelector(".canvas-scroll").scrollTo(0, 0); });
    $("reset").addEventListener("click", () => { document.activeElement.blur(); transact(() => { state = M.initial(); selected = "a"; }); });
    for (const [id, source, target] of [["undo", undo, redo], ["redo", redo, undo]]) $(id).addEventListener("click", () => {
      if (!source.length) return;
      document.activeElement.blur(); target.push(structuredClone(state)); state = source.pop(); render(); save();
    });
    $("page").addEventListener("click", event => {
      if (shapeEditing || layoutEditing) return;
      const r = $("page").getBoundingClientRect(), x = (event.clientX - r.left) * 1200 / r.width, y = (event.clientY - r.top) * 1600 / r.height;
      const panel = [...state.panels].reverse().find(p => {
        const path = new Path2D(); shapes.get(p.id).forEach((v, i) => i ? path.lineTo(v.x, v.y) : path.moveTo(v.x, v.y)); path.closePath();
        return ctx.isPointInPath(path, x, y);
      });
      if (panel) select(panel.id);
    });
    $("page").addEventListener("pointerdown", event => {
      const box = boxes.get(selected), panel = current();
      if (!box || panel.locked) return;
      const point = localPoint(event, box), vertices = panel.customVertices || rectangleVertices();
      if (shapeEditing) {
        shapeGesture = structuredClone(state);
        const pixel = { x: point.x * box.width, y: point.y * box.height };
        activeVertex = vertices.findIndex(vertex => Math.hypot(vertex.x * box.width - pixel.x, vertex.y * box.height - pixel.y) < 28);
        if (activeVertex < 0) { panel.customVertices = vertices; addAtNearestEdge(panel.customVertices, point); activeVertex = panel.customVertices.indexOf(point); }
        capturePointer(event); render(); event.preventDefault(); return;
      }
      if (layoutEditing && state.layoutMode === "custom" && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1) {
        const corner = point.x > .84 && point.y > .84;
        const rect = $("page").getBoundingClientRect();
        layoutGesture = structuredClone(state); layoutPointerStart = { x: (event.clientX - rect.left) * 1200 / rect.width, y: (event.clientY - rect.top) * 1600 / rect.height,
          frame: structuredClone(state.customFrames[selected]), resize: corner };
        capturePointer(event); event.preventDefault();
      }
    });
    $("page").addEventListener("pointermove", event => {
      const box = boxes.get(selected), panel = current();
      if (!box || panel.locked) return;
      const point = localPoint(event, box);
      if (shapeEditing && shapeGesture) { panel.customVertices[activeVertex] = point; render(); event.preventDefault(); return; }
      if (layoutEditing && layoutGesture && state.layoutMode === "custom") {
        const frame = state.customFrames[selected];
        const rect = $("page").getBoundingClientRect(), x = (event.clientX - rect.left) * 1200 / rect.width, y = (event.clientY - rect.top) * 1600 / rect.height;
        if (layoutPointerStart.resize) { frame.width = Math.max(80, Math.min(1152 - frame.x, layoutPointerStart.frame.width + x - layoutPointerStart.x)); frame.height = Math.max(80, Math.min(1552 - frame.y, layoutPointerStart.frame.height + y - layoutPointerStart.y)); }
        else { frame.x = Math.max(48, Math.min(1152 - frame.width, layoutPointerStart.frame.x + x - layoutPointerStart.x)); frame.y = Math.max(48, Math.min(1552 - frame.height, layoutPointerStart.frame.y + y - layoutPointerStart.y)); }
        render(); event.preventDefault();
      }
    });
    $("page").addEventListener("pointerup", event => {
      if (shapeGesture) { record(shapeGesture); shapeGesture = null; activeVertex = -1; render(); }
      if (layoutGesture) { const previous = layoutGesture; layoutGesture = null; layoutPointerStart = null; record(previous); render(); }
      if ($("page").hasPointerCapture(event.pointerId)) $("page").releasePointerCapture(event.pointerId);
    });
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function exported() {
    return { ...structuredClone(state), geometry: state.panels.map(p => ({ id: p.id, frame: boxes.get(p.id), vertices: shapes.get(p.id) })) };
  }
  async function decode(id, src) {
    if (images.has(src)) return;
    const image = new Image(); image.src = src; await image.decode();
    if (image.width > 8192 || image.height > 8192 || image.width * image.height > 16000000) throw Error("图片超过尺寸上限");
    images.set(src, image);
  }
  async function importProject(file) {
    if (!file || file.size > 10 * 1024 * 1024) { notice("项目文件上限 10 MiB"); return; }
    try {
      const next = JSON.parse(await file.text());
      if (!M.validate(next)) throw Error("不是有效的工作台 Demo 项目，当前草稿未改变");
      delete next.geometry;
      for (const [id, src] of Object.entries(next.assets)) await decode(id, src);
      transact(() => { state = next; selected = next.order[0]; }); syncAssetOptions(); render(); notice("项目已导入，可撤销");
    } catch (error) { notice(error.message); }
  }
  async function importImage(file) {
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024) { notice("请选择不超过 4 MiB 的 PNG、JPEG 或 WebP"); return; }
    const targetId = selected;
    try {
      const src = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
      });
      const id = "asset-" + crypto.randomUUID(); await decode(id, src);
      transact(() => {
        const target = state.panels.find(p => p.id === targetId);
        if (!target || target.locked) throw Error("原目标格不可编辑，图片未应用");
        state.assets[id] = src; target.asset = id;
      }); syncAssetOptions(); render();
    } catch { notice("图片载入失败"); }
  }
  function syncAssetOptions() {
    $("asset").querySelectorAll("[data-custom]").forEach(option => option.remove());
    Object.keys(state.assets).forEach((id, i) => {
      const option = document.createElement("option"); option.value = id; option.dataset.custom = "true"; option.textContent = "导入图片 " + (i + 1); $("asset").append(option);
    });
  }
  function bindFiles() {
    $("asset").addEventListener("change", () => edit(() => { current().asset = $("asset").value || null; }));
    $("export-json").addEventListener("click", () => download(new Blob([JSON.stringify(exported(), null, 2)], { type: "application/json" }), "comic-workbench-demo.json"));
    $("export-png").addEventListener("click", () => {
      if (captionOverflow()) { notice("旁白超出格子，请缩短文字或扩大格子后导出"); return; }
      $("page").toBlob(blob => { if (blob) download(blob, "comic-page.png"); else notice("PNG 导出失败"); }, "image/png");
    });
    $("import-json").addEventListener("click", () => $("json-file").click());
    $("import-image").addEventListener("click", () => $("image-file").click());
    $("json-file").addEventListener("change", () => { void importProject($("json-file").files[0]); $("json-file").value = ""; });
    $("image-file").addEventListener("change", () => { void importImage($("image-file").files[0]); $("image-file").value = ""; });
  }
  async function initialize() {
    document.querySelectorAll("[data-icon]").forEach(element => { element.innerHTML = window.DEMO_ICONS[element.dataset.icon]; });
    restore();
    for (const [id, src] of Object.entries({ ...window.PROTOTYPE_DATA.images, ...state.assets })) await decode(id, src);
    syncAssetOptions(); bindEdits(); bindNavigation(); bindFiles(); render();
    window.demoTest = { state: () => structuredClone(state), export: exported, select, importProject, importImage,
      reset: () => { state = M.initial(); selected = "a"; undo.length = redo.length = 0; render(); },
      frames: () => Object.fromEntries([...boxes].map(([id, b]) => [id, { x: b.x, y: b.y, width: b.width, height: b.height }])) };
    window.demoReady = true;
  }
  initialize().catch(error => { window.demoErrors.push(error.message); notice("Demo 载入失败：" + error.message); });
})();
