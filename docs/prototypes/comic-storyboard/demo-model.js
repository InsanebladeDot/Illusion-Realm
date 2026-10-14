"use strict";

// Rectangular split trees provide linked boundaries; content keeps stable panel IDs.
(() => {
  const leaf = panelId => ({ panelId });
  const branch = (id, axis, ratio, a, b) => ({ id, axis, ratio, children: [a, b] });
  function initial() {
    return { format: "illusion-realm-comic-workbench-demo", version: 1, title: "野营 · 午后", gutter: 24,
      layoutMode: "tree", customFrames: {}, template: "mixed", tree: branch("scene", "y", .45, leaf("a"), branch("body", "x", .68,
        branch("left", "y", .48, branch("faces", "x", .5, leaf("d"), leaf("c")), leaf("e")), leaf("b"))),
      order: ["a", "b", "c", "d", "e"], assets: {}, panels: [
        panel("a", "场景建立", "panel-a", "午后，三人在营地围坐。", .5, .19),
        panel("b", "空间关系", "panel-c", "人物与营地的位置关系。", .5, .5),
        panel("c", "人物反应", "panel-b", "她看向锅中的物件。", .5, .18),
        panel("d", "人物反应", "panel-c", "他停下动作，望向同伴。", .5, .12),
        panel("e", "对话与揭示", "panel-a", "三人交换目光。", .5, .25),
      ] };
  }
  function panel(id, name, asset, description, x = .5, y = .5) {
    return { id, name, asset, description, edge: id === "c" ? "photo" : id === "e" ? "memory" : "straight", seed: 7919 + id.charCodeAt(0) * 127,
      roughness: 26, focusX: x, focusY: y, zoom: 1, caption: "", locked: false, archived: [], customVertices: null };
  }
  function frames(state) {
    const result = new Map();
    if (state.layoutMode === "custom") {
      state.panels.forEach(panel => {
        const frame = state.customFrames[panel.id];
        if (frame) result.set(panel.id, { ...frame, ancestors: [], custom: true });
      });
      return result;
    }
    function visit(node, box, ancestors) {
      if (node.panelId) { result.set(node.panelId, { ...box, ancestors }); return; }
      const length = node.axis === "x" ? box.width : box.height;
      const first = (length - state.gutter) * node.ratio;
      const a = { ...box }, b = { ...box };
      if (node.axis === "x") { a.width = first; b.x += first + state.gutter; b.width = length - first - state.gutter; }
      else { a.height = first; b.y += first + state.gutter; b.height = length - first - state.gutter; }
      visit(node.children[0], a, [...ancestors, node]);
      visit(node.children[1], b, [...ancestors, node]);
    }
    visit(state.tree, { x: 48, y: 48, width: 1104, height: 1504 }, []);
    return result;
  }
  function findNode(node, id) {
    if (node.id === id || node.panelId === id) return node;
    if (!node.children) return null;
    return findNode(node.children[0], id) || findNode(node.children[1], id);
  }
  function validTree(node, panelIds, seen, depth = 0) {
    if (!node || typeof node !== "object" || depth > 24) return false;
    if (typeof node.panelId === "string") {
      if (!panelIds.has(node.panelId) || seen.has(node.panelId) || node.children) return false;
      seen.add(node.panelId); return true;
    }
    if (typeof node.id !== "string" || seen.has(node.id) || !["x", "y"].includes(node.axis)
      || !Number.isFinite(node.ratio) || node.ratio < .1 || node.ratio > .9
      || !Array.isArray(node.children) || node.children.length !== 2) return false;
    seen.add(node.id);
    return node.children.every(child => validTree(child, panelIds, seen, depth + 1));
  }
  function validate(state) {
    if (!state || state.format !== initial().format || state.version !== 1 || typeof state.title !== "string"
      || state.title.length > 100 || !Number.isFinite(state.gutter) || state.gutter < 8 || state.gutter > 64
      || !["mixed", "balanced", "strips", "custom"].includes(state.template)
      || !["tree", "custom"].includes(state.layoutMode) || !Array.isArray(state.panels)
      || state.panels.length < 1 || state.panels.length > 16 || !state.assets || typeof state.assets !== "object" || Array.isArray(state.assets)) return false;
    if (!state.panels.every(validPanel) || !state.customFrames || typeof state.customFrames !== "object" || Array.isArray(state.customFrames)) return false;
    const ids = new Set(state.panels.map(p => p.id));
    if (ids.size !== state.panels.length || !Array.isArray(state.order)
      || state.order.length !== ids.size || new Set(state.order).size !== ids.size || !state.order.every(id => ids.has(id))) return false;
    const seen = new Set();
    if (!validTree(state.tree, ids, seen) || ![...ids].every(id => seen.has(id))) return false;
    if (state.layoutMode === "custom" && (Object.keys(state.customFrames).length !== ids.size
      || ![...ids].every(id => validFrame(state.customFrames[id])))) return false;
    if (!Object.values(state.assets).every(src => typeof src === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src))) return false;
    if (!Object.keys(state.assets).every(id => /^asset-[a-z0-9-]{1,80}$/.test(id))) return false;
    if (!state.panels.every(p => p.asset === null || ["panel-a", "panel-b", "panel-c", "panel-d"].includes(p.asset)
      || Object.hasOwn(state.assets, p.asset))) return false;
    return [...frames(state).values()].every(box => box.width >= 80 && box.height >= 80);
  }
  function validPanel(p) {
    return p && typeof p.id === "string" && /^[a-z0-9-]{1,80}$/.test(p.id)
      && typeof p.name === "string" && p.name.length <= 100 && typeof p.description === "string" && p.description.length <= 2000
      && typeof p.caption === "string" && p.caption.length <= 80 && typeof p.locked === "boolean"
      && ["straight", "photo", "memory", "impact"].includes(p.edge) && Number.isInteger(p.seed) && p.seed >= 0 && p.seed <= 4294967295
      && Number.isFinite(p.roughness) && p.roughness >= 8 && p.roughness <= 44
      && [p.focusX, p.focusY].every(v => Number.isFinite(v) && v >= 0 && v <= 1)
      && Number.isFinite(p.zoom) && p.zoom >= 1 && p.zoom <= 2.5 && Array.isArray(p.archived)
      && p.archived.length <= 16 && p.archived.every(a => a && typeof a.name === "string" && typeof a.description === "string" && typeof a.caption === "string")
      && (p.customVertices === null || (Array.isArray(p.customVertices) && p.customVertices.length >= 3 && p.customVertices.length <= 64
        && p.customVertices.every(v => v && Number.isFinite(v.x) && Number.isFinite(v.y) && v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1)));
  }

  function validFrame(frame) {
    return frame && ["x", "y", "width", "height"].every(key => Number.isFinite(frame[key]))
      && frame.x >= 48 && frame.y >= 48 && frame.x + frame.width <= 1152 && frame.y + frame.height <= 1552
      && frame.width >= 80 && frame.height >= 80;
  }
  function split(state, id, axis) {
    const selected = state.panels.find(p => p.id === id);
    if (selected.locked) throw Error("当前格已锁定");
    const newId = "p-" + crypto.randomUUID();
    const oldFrame = state.layoutMode === "custom" ? frames(state).get(id) : null;
    const node = findNode(state.tree, id);
    delete node.panelId;
    Object.assign(node, branch("cut-" + crypto.randomUUID(), axis, .5, leaf(id), leaf(newId)));
    state.panels.push(panel(newId, "新分镜", null, ""));
    state.order.splice(state.order.indexOf(id) + 1, 0, newId);
    if (oldFrame) {
      const first = (axis === "x" ? oldFrame.width : oldFrame.height) / 2 - state.gutter / 2;
      state.customFrames[id] = { x: oldFrame.x, y: oldFrame.y, width: axis === "x" ? first : oldFrame.width, height: axis === "y" ? first : oldFrame.height };
      state.customFrames[newId] = { x: axis === "x" ? oldFrame.x + first + state.gutter : oldFrame.x, y: axis === "y" ? oldFrame.y + first + state.gutter : oldFrame.y,
        width: axis === "x" ? first : oldFrame.width, height: axis === "y" ? first : oldFrame.height };
    }
    state.template = "balanced";
  }
  function merge(state, id) {
    if (state.layoutMode === "custom") throw Error("自定义排版下暂不自动合并，请先切回树形排版");
    const path = frames(state).get(id).ancestors;
    const parent = path[path.length - 1];
    if (!parent || !parent.children.every(child => child.panelId)) throw Error("只能合并同一分界线两侧的直接兄弟格");
    const otherId = parent.children.find(child => child.panelId !== id).panelId;
    const keep = state.panels.find(p => p.id === id), other = state.panels.find(p => p.id === otherId);
    if (keep.locked || other.locked) throw Error("合并成员存在锁定格");
    keep.archived.push({ name: other.name, description: other.description, caption: other.caption });
    if (other.asset || other.archived.length) throw Error("另一格有图片或合并归档，请先保留内容，或撤销最近一次切格");
    delete parent.id; delete parent.axis; delete parent.ratio; delete parent.children;
    parent.panelId = id;
    state.panels = state.panels.filter(p => p.id !== otherId);
    state.order = state.order.filter(panelId => panelId !== otherId);
  }
  function template(state, kind) {
    if (state.panels.some(p => p.locked)) throw Error("页面含锁定格，无法换版式");
    const ids = state.order;
    if (kind === "custom") {
      const current = frames(state);
      state.customFrames = Object.fromEntries(ids.map(id => {
        const frame = current.get(id);
        return [id, { x: frame.x, y: frame.y, width: frame.width, height: frame.height }];
      }));
      state.layoutMode = "custom"; state.template = "custom"; return;
    }
    if (kind === "mixed" && ids.length !== 5) throw Error("混合页漫模板需要 5 格，现有内容不会删除");
    function arrange(items, depth = 0) {
      if (items.length === 1) return leaf(items[0]);
      const mid = kind === "strips" ? 1 : Math.ceil(items.length / 2);
      return branch("layout-" + crypto.randomUUID(), kind === "strips" ? "y" : depth % 2 ? "y" : "x",
        mid / items.length, arrange(items.slice(0, mid), depth + 1), arrange(items.slice(mid), depth + 1));
    }
    state.tree = kind === "mixed" ? initial().tree : arrange(ids);
    if (kind === "mixed") {
      const replacements = new Map(["a", "b", "c", "d", "e"].map((id, i) => [id, ids[i]]));
      function map(node) { if (node.panelId) node.panelId = replacements.get(node.panelId); else node.children.forEach(map); }
      map(state.tree);
    }
    state.template = kind; state.layoutMode = "tree"; state.customFrames = {};
  }
  const api = { initial, frames, findNode, validate, split, merge, template };
  globalThis.ComicDemoModel = api;
  if (typeof module !== "undefined") module.exports = api;
})();
