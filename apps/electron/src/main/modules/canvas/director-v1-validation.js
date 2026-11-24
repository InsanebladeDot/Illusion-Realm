// 导演台的主进程等价校验：仅检查纯数据，不加载 React、Zod 或三维资源。
// 像收件处核对装箱单，先验字段，再验人物、机位和动画之间的身份引用。
// 入口可接收任意值，损坏文档返回 false，不把 TypeError 当校验结果。
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function object(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @param {number} min @param {number} max */
function number(value, min, max) { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }
/** @param {unknown} value @param {number} min @param {number} max */
function text(value, min, max) { return typeof value === "string" && value.length >= min && value.length <= max; }
/** @param {unknown} value */
function id(value) { return text(value, 1, 200); }
/** @param {unknown} value */
function vec(value) { return object(value) && [value.x, value.y, value.z].every(item => number(item, -10000, 10000)); }
/** @param {unknown} value */
function scale(value) { return object(value) && [value.x, value.y, value.z].every(item => number(item, .01, 50)); }
/** @param {unknown} value */
function color(value) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value); }
/** @param {unknown} value */
function posture(value) { return object(value) && Object.entries(value).every(([key, angles]) => key.length <= 40 && object(angles) && Object.entries(angles).every(([axis, angle]) => axis.length <= 40 && number(angle, -180, 180))); }
/** @param {unknown} value */
function ik(value) { return object(value) && ["l_hand", "r_hand", "l_foot", "r_foot"].every(key => value[key] === undefined || vec(value[key])); }
/** @param {unknown} value */
function sceneObject(value) {
  return object(value) && id(value.id) && text(value.label, 1, 80) && ["character", "prop", "camera"].includes(typeof value.kind === "string" ? value.kind : "") && vec(value.position) && vec(value.rotation) && scale(value.scale) && typeof value.visible === "boolean" && typeof value.locked === "boolean" && color(value.color) && text(value.assetId, 0, 80) && text(value.bodyType, 0, 40) && posture(value.posture) && ik(value.ik) && vec(value.lookAt) && text(value.lookAtTarget, 0, 200) && number(value.fov, 10, 120);
}
/** @param {unknown} value */
function keyframe(value) {
  return object(value) && id(value.id) && number(value.frame, 0, 180000) && Number.isInteger(value.frame) && ["linear", "spline"].includes(typeof value.interp === "string" ? value.interp : "") && ["linear", "easeInOut", "easeIn", "easeOut"].includes(typeof value.easing === "string" ? value.easing : "") && vec(value.position) && vec(value.rotation) && scale(value.scale) && vec(value.lookAt) && number(value.fov, 10, 120) && posture(value.posture) && object(value.bezier) && [value.bezier.x1, value.bezier.y1, value.bezier.x2, value.bezier.y2].every(item => number(item, 0, 1));
}
/** @param {unknown} value */
function track(value) {
  return object(value) && id(value.id) && id(value.targetId) && typeof value.muted === "boolean" && typeof value.locked === "boolean" && Array.isArray(value.keyframes) && value.keyframes.length <= 2000 && value.keyframes.every(keyframe);
}
/** @param {unknown} value */
function animation(value) {
  return object(value) && id(value.id) && text(value.label, 1, 80) && number(value.fps, 1, 120) && Number.isInteger(value.fps) && number(value.durationFrames, 1, 180000) && Number.isInteger(value.durationFrames) && ["once", "loop", "pingpong"].includes(typeof value.playMode === "string" ? value.playMode : "") && number(value.playbackSpeed, .25, 2) && Array.isArray(value.tracks) && value.tracks.length <= 200 && value.tracks.every(track);
}
/** @param {unknown} value */
function group(value) {
  return object(value) && id(value.id) && text(value.label, 1, 80) && Array.isArray(value.memberIds) && value.memberIds.length <= 500 && value.memberIds.every(id);
}
// 这里只在结构全部通过后读取引用，因此内部类型断言不放宽外部输入。
// 重复身份、悬空跟踪和同帧重复关键帧与渲染层规则一致。
/** @param {import('@illusion-realm/shared').LegacyDirectorScene} value */
function references(value) {
  const ids = new Set(value.objects.map(item => item.id)), groups = new Set(value.groups.map(item => item.id));
  if (ids.size !== value.objects.length || groups.size !== value.groups.length) return false;
  const members = value.groups.flatMap(item => item.memberIds);
  if (new Set(members).size !== members.length || members.some(item => !ids.has(item))) return false;
  if (value.activeCamera !== null && !value.objects.some(item => item.id === value.activeCamera && item.kind === "camera")) return false;
  if (!value.objects.every(item => !item.lookAtTarget || item.lookAtTarget === "__none__" || ids.has(item.lookAtTarget))) return false;
  return new Set(value.animations.map(item => item.id)).size === value.animations.length && value.animations.every(item => validTracks(item, ids));
}
// 与 shared 保持相同的身份唯一性，主进程也要拒绝重复轨道和重复关键帧身份。
// 不只检查帧号，因为 UI 和撤销定位用的是 ID，而不是数组中的排列位置。
/** @param {import('@illusion-realm/shared').LegacyDirectorAnimation} value @param {Set<string>} ids */
function validTracks(value, ids) {
  if (new Set(value.tracks.map(track => track.id)).size !== value.tracks.length) return false;
  if (new Set(value.tracks.map(track => track.targetId)).size !== value.tracks.length) return false;
  return value.tracks.every(track => ids.has(track.targetId)
    && new Set(track.keyframes.map(key => key.id)).size === track.keyframes.length
    && new Set(track.keyframes.map(key => key.frame)).size === track.keyframes.length
    && track.keyframes.every(key => key.frame <= value.durationFrames));
}
/** @param {unknown} value @returns {value is import('@illusion-realm/shared').LegacyDirectorScene} */
function scene(value) {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.objects) || value.objects.length > 500 || !value.objects.every(sceneObject)) return false;
  if (!Array.isArray(value.groups) || value.groups.length > 100 || !value.groups.every(group) || !Array.isArray(value.animations) || value.animations.length > 20 || !value.animations.every(animation)) return false;
  if (!(value.activeCamera === null || id(value.activeCamera)) || !number(value.aspectRatio, .3, 3) || !color(value.skyColor) || !number(value.groundOpacity, 0, 1) || !number(value.groundHeight, -10000, 10000)) return false;
  if (typeof value.showLabels !== "boolean" || !number(value.labelFontSize, 8, 40) || !Number.isInteger(value.labelFontSize) || typeof value.showBaseMarker !== "boolean") return false;
  if (!object(value.editorCameraPose) || !vec(value.editorCameraPose.position) || !vec(value.editorCameraPose.target) || !number(value.editorCameraPose.fov, 10, 120)) return false;
  if (value.previewPath !== undefined && !text(value.previewPath, 0, 32767)) return false;
  return references(/** @type {import('@illusion-realm/shared').LegacyDirectorScene} */ (/** @type {unknown} */ (value)));
}
module.exports = { scene };
