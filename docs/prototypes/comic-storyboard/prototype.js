"use strict";

(() => {
  const { layout: initialLayout, images: imageSources } = window.PROTOTYPE_DATA;
  const canvas = document.getElementById("page");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const selection = document.getElementById("selection").getContext("2d");
  const names = { "panel-a": "场景建立", "panel-b": "人物反应", "panel-c": "对话视角", "panel-d": "物件揭示" };
  const descriptions = { "panel-a": "野营全景 · 完整场景原图", "panel-b": "人物中近景 · 底层 B", "panel-c": "人物近景 · 底层 C", "panel-d": "锅中物件特写 · 独立上层图像，以多边形裁切覆盖底格" };
  let layout = structuredClone(initialLayout);
  let selectedId = "panel-d";
  let images = {};
  const undoStack = [];
  const redoStack = [];
  let gestureStart = null;
  let polygon = [];
  let saveTimer = null;
  const storageKey = "ir-comic-diagonal-prototype-v1";
  const getLetter = id => id.slice(-1).toUpperCase();

  function overlayPolygon() {
    const sign = layout.overlay.direction === "down-right" ? 1 : -1;
    const x1 = sign === 1 ? 200 : 1000;
    const x2 = sign === 1 ? 1000 : 200;
    const start = { x: x1 + layout.overlay.offset, y: 40 };
    const end = { x: x2 + layout.overlay.offset, y: 1560 };
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const dx = -(end.y - start.y) / length * layout.overlay.width / 2;
    const dy = (end.x - start.x) / length * layout.overlay.width / 2;
    const vertices = [
      { x: start.x + dx, y: start.y + dy },
      { x: start.x - dx, y: start.y - dy },
      { x: end.x - dx, y: end.y - dy },
      { x: end.x + dx, y: end.y + dy },
    ];
    const widthLimit = layout.overlay.generatorVersion === 1 ? .22 : .3;
    return clipToPage(layout.overlay.edge === "torn"
      ? window.createPhotoTear(vertices, Math.min(layout.overlay.roughness, layout.overlay.width * widthLimit), layout.overlay.seed, layout.overlay) : vertices);
  }

  function clipToPage(vertices, box = { x: 0, y: 0, width: 1200, height: 1600 }) {
    for (const [axis, bound, greater] of [["x", box.x, true], ["x", box.x + box.width, false], ["y", box.y, true], ["y", box.y + box.height, false]]) {
      const input = vertices;
      vertices = [];
      const inside = point => greater ? point[axis] >= bound : point[axis] <= bound;
      input.forEach((end, i) => {
        const start = input[(i + input.length - 1) % input.length];
        if (inside(start) !== inside(end)) {
          const fraction = (bound - start[axis]) / (end[axis] - start[axis]);
          vertices.push({ x: start.x + fraction * (end.x - start.x), y: start.y + fraction * (end.y - start.y), [axis]: bound });
        }
        if (inside(end)) vertices.push(end);
      });
    }
    return vertices;
  }

  function restoreDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!draft) return;
      const o = draft.overlay;
      const validOrder = Array.isArray(draft.panelOrder) && draft.panelOrder.length === 4
        && new Set(draft.panelOrder).size === 4 && draft.panelOrder.every(id => initialLayout.renderOrder.includes(id));
      if (!o || !["down-right", "down-left"].includes(o.direction) || !Number.isFinite(o.width)
        || o.width < 80 || o.width > 480 || !Number.isFinite(o.offset) || Math.abs(o.offset) > 260
        || typeof o.visible !== "boolean" || !validOrder || ![1, 2, 3].includes(draft.version)) return;
      if (draft.version >= 2 && (!["straight", "torn"].includes(o.edge) || !Number.isInteger(o.seed)
        || o.seed < 0 || o.seed > 4294967295 || !Number.isFinite(o.roughness) || o.roughness < 8
        || o.roughness > 44 || ![1, 2].includes(o.generatorVersion) || !["polygon", "rectangle"].includes(draft.baseShape))) return;
      if (draft.version === 3 && !restorePanelEdges(draft)) return;
      if (draft.version === 2 && (o.generatorVersion !== 1 || o.preset && !Object.hasOwn(window.TEAR_PRESETS, o.preset))) return;
      layout.overlay = { ...initialLayout.overlay, direction: o.direction, width: o.width, offset: o.offset, visible: o.visible,
        ...(draft.version >= 2 ? { edge: o.edge, roughness: o.roughness, seed: o.seed,
          generatorVersion: o.generatorVersion, preset: o.preset || "photo" } : { edge: "straight" }) };
      if (draft.version < 3) layout.panels.forEach(panel => { panel.edge = "straight"; });
      layout.baseShape = draft.version >= 2 ? draft.baseShape : "rectangle";
      layout.panelOrder = draft.panelOrder;
      document.getElementById("save-state").textContent = "已恢复本机草稿";
    } catch { document.getElementById("save-state").textContent = "本机草稿不可用"; }
  }

  function tracePolygon(ctx, vertices) {
    ctx.beginPath();
    vertices.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
  }

  function validEdge(settings) {
    return settings && ["straight", "torn"].includes(settings.edge) && Object.hasOwn(window.TEAR_PRESETS, settings.preset)
      && Number.isFinite(settings.roughness) && settings.roughness >= 8 && settings.roughness <= 44
      && Number.isInteger(settings.seed) && settings.seed >= 0 && settings.seed <= 4294967295
      && [1, 2].includes(settings.generatorVersion);
  }

  function restorePanelEdges(draft) {
    if (!validEdge(draft.overlay) || !Array.isArray(draft.panels) || draft.panels.length !== 3) return false;
    const records = layout.panels.map(panel => draft.panels.filter(item => item.id === panel.id));
    if (!records.every(items => items.length === 1 && validEdge(items[0]))) return false;
    layout.panels.forEach((panel, index) => {
      const { edge, preset, roughness, seed, generatorVersion } = records[index][0];
      Object.assign(panel, { edge, preset, roughness, seed, generatorVersion });
    });
    return true;
  }

  function edgeTarget() {
    return selectedId === "panel-d" ? layout.overlay : layout.panels.find(panel => panel.id === selectedId);
  }

  function framePixels(panel) {
    const f = panel.frame;
    return { x: f.x * 1200, y: f.y * 1600, width: f.width * 1200, height: f.height * 1600 };
  }

  function drawCover(ctx, image, box, focusY = .5) {
    const scale = Math.max(box.width / image.width, box.height / image.height);
    ctx.drawImage(image, box.x + (box.width - image.width * scale) / 2,
      box.y + (box.height - image.height * scale) * focusY, image.width * scale, image.height * scale);
  }

  function drawBase(panel) {
    const box = framePixels(panel);
    const vertices = basePolygon(panel);
    if (panel.edge === "torn") drawPaperEdge(vertices, panel);
    context.save();
    tracePolygon(context, basePolygon(panel));
    context.clip();
    drawCover(context, images[panel.id], box, panel.cropFocusY ?? .5);
    context.restore();
    if (panel.edge === "torn" && window.TEAR_PRESETS[panel.preset].paper) return;
    context.strokeStyle = "#20252a";
    context.lineWidth = 4;
    tracePolygon(context, basePolygon(panel));
    context.stroke();
  }

  function basePolygon(panel) {
    const box = framePixels(panel);
    const shapes = {
      "panel-a": [[0, .03], [.96, 0], [1, .89], [.06, 1]],
      "panel-b": [[.025, .1], [1, 0], [.96, 1], [0, .9]],
      "panel-c": [[0, .02], [.94, .1], [1, .98], [.035, 1]],
    };
    const points = layout.baseShape === "polygon" ? shapes[panel.id] : [[0, 0], [1, 0], [1, 1], [0, 1]];
    const vertices = points.map(([x, y]) => ({ x: box.x + x * box.width, y: box.y + y * box.height }));
    return panel.edge === "torn" ? clipToPage(window.createPhotoTear(vertices, panel.roughness, panel.seed,
      { ...panel, inwardOnly: true }), box) : vertices;
  }

  function drawOverlay() {
    if (!layout.overlay.visible) return;
    drawPaperEdge();
    context.save();
    tracePolygon(context, polygon);
    context.clip();
    const sign = layout.overlay.direction === "down-right" ? 1 : -1;
    context.translate(600 + layout.overlay.offset, 800);
    context.rotate(Math.atan2(1520, 800 * sign));
    drawCover(context, images["panel-d"], { x: -859, y: -layout.overlay.width / 2, width: 1718, height: layout.overlay.width });
    context.restore();
    if (layout.overlay.edge === "torn" && window.TEAR_PRESETS[layout.overlay.preset].paper) return;
    tracePolygon(context, polygon);
    context.strokeStyle = "#20252a";
    context.lineWidth = 4;
    context.stroke();
  }

  function drawPaperEdge(vertices = polygon, settings = layout.overlay) {
    const paper = settings.edge === "torn" && window.TEAR_PRESETS[settings.preset].paper;
    context.save();
    tracePolygon(context, vertices);
    context.fillStyle = "#fff";
    context.strokeStyle = "#fff";
    context.lineWidth = settings.edge === "straight" ? 14 : paper && settings.generatorVersion === 1 ? 18 : paper ? 14 : 7;
    context.lineJoin = "round";
    if (paper) {
      context.shadowColor = "#20252a55";
      context.shadowBlur = 12;
      context.shadowOffsetX = 5;
      context.shadowOffsetY = 7;
    }
    context.fill();
    context.stroke();
    context.restore();
  }

  function insidePolygon(x, y, vertices = polygon) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const a = vertices[i], b = vertices[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  function visibleRatios() {
    return layout.panels.map(panel => {
      const box = framePixels(panel);
      let covered = 0, total = 0;
      const vertices = basePolygon(panel);
      const samples = 100;
      for (let y = 0; y < samples; y++) for (let x = 0; x < samples; x++) {
        const px = box.x + (x + .5) * box.width / samples, py = box.y + (y + .5) * box.height / samples;
        if (!insidePolygon(px, py, vertices)) continue;
        total++;
        if (layout.overlay.visible && insidePolygon(px, py)) covered++;
      }
      return { id: panel.id, ratio: 1 - covered / total };
    });
  }

  function drawSelection() {
    selection.clearRect(0, 0, 1200, 1600);
    selection.strokeStyle = "#08a18d";
    selection.lineWidth = 8;
    selection.setLineDash([18, 10]);
    if (selectedId === "panel-d" && layout.overlay.visible) {
      tracePolygon(selection, polygon);
      selection.stroke();
    } else {
      const panel = layout.panels.find(item => item.id === selectedId);
      if (panel) {
        tracePolygon(selection, basePolygon(panel));
        selection.stroke();
      }
    }
  }

  function updateVisibility() {
    const ratios = visibleRatios();
    document.getElementById("visibility").innerHTML = ratios.map(({ id, ratio }) =>
      `<div class="visibility-row"><span>${getLetter(id)}</span><div class="meter"><div class="meter-fill" style="width:${ratio * 100}%"></div></div><span>${Math.round(ratio * 100)}%</span></div>`).join("");
    const warning = ratios.some(item => item.ratio < .3);
    const status = document.getElementById("occlusion-status");
    status.classList.toggle("warning", warning);
    status.textContent = warning ? "底格可见面积低于 30%，请调整覆盖。" : "底格可读 · 面积为采样估算，尚未检查人物和对白保护区。";
  }

  function updateEdgeControls() {
    const target = edgeTarget();
    document.getElementById("edge-target").textContent = getLetter(selectedId);
    document.getElementById("edge-preset").value = target.preset;
    document.getElementById("tear-roughness").value = target.roughness;
    document.getElementById("roughness-value").value = `${target.roughness} px`;
    document.getElementById("tear-roughness").disabled = target.edge !== "torn";
    document.getElementById("new-tear").disabled = target.edge !== "torn";
    document.getElementById("irregular-bases").checked = layout.baseShape === "polygon";
    document.querySelectorAll("[data-edge]").forEach(button => button.setAttribute("aria-pressed", button.dataset.edge === target.edge));
  }

  function updateControls() {
    updateEdgeControls();
    document.getElementById("band-width").value = layout.overlay.width;
    document.getElementById("band-offset").value = layout.overlay.offset;
    document.getElementById("width-value").value = `${layout.overlay.width} px`;
    document.getElementById("offset-value").value = `${layout.overlay.offset} px`;
    document.getElementById("overlay-visible").checked = layout.overlay.visible;
    document.querySelectorAll("[data-direction]").forEach(button => button.setAttribute("aria-pressed", button.dataset.direction === layout.overlay.direction));
    document.querySelectorAll(".layer").forEach(button => button.setAttribute("aria-pressed", button.dataset.id === selectedId));
    document.getElementById("undo").disabled = !undoStack.length;
    document.getElementById("redo").disabled = !redoStack.length;
    const order = layout.panelOrder.join(",");
    document.getElementById("reading-order").value = order === "panel-a,panel-b,panel-d,panel-c" ? "impact" : order === "panel-a,panel-d,panel-b,panel-c" ? "early" : "linear";
    document.getElementById("selection-summary").textContent = `${getLetter(selectedId)} · ${names[selectedId]}`;
    document.getElementById("detail-title").textContent = `${getLetter(selectedId)} · ${names[selectedId]}`;
    document.getElementById("detail-description").textContent = descriptions[selectedId];
  }

  function render() {
    polygon = overlayPolygon();
    context.fillStyle = "#fff";
    context.fillRect(0, 0, 1200, 1600);
    layout.panels.forEach(drawBase);
    drawOverlay();
    drawSelection();
    updateVisibility();
    updateControls();
  }

  function save() {
    clearTimeout(saveTimer);
    document.getElementById("save-state").textContent = "保存中";
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(exportLayout()));
        document.getElementById("save-state").textContent = "本机草稿已保存";
      } catch { document.getElementById("save-state").textContent = "本机保存不可用，请导出 JSON"; }
    }, 300);
  }

  function commit(previous) {
    if (JSON.stringify(previous) === JSON.stringify(layout)) return;
    undoStack.push(previous);
    if (undoStack.length > 40) undoStack.shift();
    redoStack.length = 0;
    render();
    save();
  }

  function mutate(callback) {
    const previous = structuredClone(layout);
    callback();
    commit(previous);
  }

  function setView(view) {
    document.body.dataset.view = view;
    document.getElementById("show-stage").setAttribute("aria-pressed", view === "stage");
    document.getElementById("show-settings").setAttribute("aria-pressed", view === "settings");
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportLayout() {
    return { ...structuredClone(layout), panels: layout.panels.map(panel => ({ ...structuredClone(panel),
      shape: { kind: "polygon", vertices: basePolygon(panel).map(point => ({ x: Math.max(0, Math.min(1, (point.x / 1200 - panel.frame.x) / panel.frame.width)),
        y: Math.max(0, Math.min(1, (point.y / 1600 - panel.frame.y) / panel.frame.height)) })) } })),
      overlayVertices: polygon.map(point => ({ x: point.x / 1200, y: point.y / 1600 })) };
  }

  function bindControls() {
    bindShapeControls();
    document.querySelectorAll("[data-direction]").forEach(button => button.addEventListener("click", () => mutate(() => { layout.overlay.direction = button.dataset.direction; })));
    for (const [id, field] of [["band-width", "width"], ["band-offset", "offset"], ["tear-roughness", "roughness"]]) {
      const input = document.getElementById(id);
      input.addEventListener("input", () => {
        gestureStart ??= structuredClone(layout);
        (field === "roughness" ? edgeTarget() : layout.overlay)[field] = Number(input.value);
        render();
      });
      input.addEventListener("change", () => {
        if (gestureStart) commit(gestureStart);
        gestureStart = null;
      });
    }
    document.getElementById("overlay-visible").addEventListener("change", event => mutate(() => { layout.overlay.visible = event.target.checked; }));
    document.getElementById("reading-order").addEventListener("change", event => mutate(() => {
      const orders = { impact: ["panel-a", "panel-b", "panel-d", "panel-c"], linear: ["panel-a", "panel-b", "panel-c", "panel-d"], early: ["panel-a", "panel-d", "panel-b", "panel-c"] };
      layout.panelOrder = orders[event.target.value];
    }));
    document.getElementById("reset").addEventListener("click", () => mutate(() => { layout = structuredClone(initialLayout); }));
    document.getElementById("undo").addEventListener("click", () => { if (undoStack.length) { redoStack.push(structuredClone(layout)); layout = undoStack.pop(); render(); save(); } });
    document.getElementById("redo").addEventListener("click", () => { if (redoStack.length) { undoStack.push(structuredClone(layout)); layout = redoStack.pop(); render(); save(); } });
    document.getElementById("show-stage").addEventListener("click", () => setView("stage"));
    document.getElementById("show-settings").addEventListener("click", () => setView("settings"));
    document.getElementById("back-to-stage").addEventListener("click", () => setView("stage"));
    document.getElementById("export-json").addEventListener("click", () => download(new Blob([JSON.stringify(exportLayout(), null, 2)], { type: "application/json" }), "diagonal-layout.json"));
    document.getElementById("export-png").addEventListener("click", () => canvas.toBlob(blob => {
      if (blob) download(blob, "diagonal-page.png");
      else document.getElementById("load-state").textContent = "导出失败";
    }, "image/png"));
  }

  function bindShapeControls() {
    document.querySelectorAll("[data-edge]").forEach(button => button.addEventListener("click", () => mutate(() => { edgeTarget().edge = button.dataset.edge; })));
    document.getElementById("irregular-bases").addEventListener("change", event => mutate(() => { layout.baseShape = event.target.checked ? "polygon" : "rectangle"; }));
    document.getElementById("new-tear").addEventListener("click", () => mutate(() => { edgeTarget().seed = (edgeTarget().seed + 104729) >>> 0; }));
    document.getElementById("edge-preset").addEventListener("change", event => mutate(() => {
      Object.assign(edgeTarget(), { preset: event.target.value, edge: "torn", generatorVersion: 2 });
    }));
    document.getElementById("apply-all-edges").addEventListener("click", () => mutate(() => {
      const { edge, preset, roughness, generatorVersion } = edgeTarget();
      [layout.overlay, ...layout.panels].forEach(target => Object.assign(target, { edge, preset, roughness, generatorVersion }));
    }));
  }

  function bindCanvas() {
    canvas.addEventListener("click", event => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * 1200 / rect.width;
      const y = (event.clientY - rect.top) * 1600 / rect.height;
      if (layout.overlay.visible && insidePolygon(x, y)) selectedId = "panel-d";
      else {
        const panel = layout.panels.find(item => {
          return insidePolygon(x, y, basePolygon(item));
        });
        if (panel) selectedId = panel.id;
      }
      drawSelection();
      updateControls();
    });
  }

  async function initialize() {
    restoreDraft();
    for (const [id, src] of Object.entries(imageSources)) {
      const image = new Image();
      image.src = src;
      await image.decode();
      images[id] = image;
    }
    for (const id of [...layout.renderOrder].reverse()) {
      const button = document.createElement("button");
      button.className = "layer";
      button.dataset.id = id;
      button.innerHTML = `<img src="${imageSources[id]}" alt=""><span><strong>${getLetter(id)} · ${names[id]}</strong><small>${id === "panel-d" ? "跨三格覆盖" : "底层分镜"}</small></span><span class="level">${id === "panel-d" ? "顶层" : "底层"}</span>`;
      button.addEventListener("click", () => { selectedId = id; drawSelection(); updateControls(); });
      document.getElementById("layers").append(button);
    }
    bindControls();
    bindCanvas();
    setView("stage");
    render();
    document.getElementById("load-state").textContent = "4 张素材已载入";
    window.prototypeTest = { getLayout: exportLayout, getVisibleRatios: visibleRatios,
      getSelected: () => selectedId, reset: () => { layout = structuredClone(initialLayout); render(); } };
    window.prototypeReady = true;
  }

  initialize().catch(error => {
    document.getElementById("load-state").textContent = "素材载入失败";
    window.prototypeErrors.push(error.message);
  });
})();
