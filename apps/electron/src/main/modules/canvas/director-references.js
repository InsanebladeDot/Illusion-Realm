// @ts-check
// 引用检查由共享规则同步，运行时不加载渲染器或 Zod。
/** @param {import("@illusion-realm/shared").DirectorDocument} scene */
function validDirectorReferences(scene) {
    const objects = [...scene.characters, ...scene.props, ...scene.cameras];
    const ids = new Set(objects.map(item => item.id));
    const members = scene.groups.flatMap(group => group.memberIds);
    const kinds = new Map([
        ...scene.characters.map(item => [item.id, "character"]),
        ...scene.cameras.map(item => [item.id, "camera"]),
        ...scene.props.map(item => [item.id, "prop"]),
    ].map(item => /** @type {[string, string]} */ (item)));
    if (ids.size !== objects.length || objects.length > 500) return false;
    if (!unique(scene.groups) || new Set(members).size !== members.length) return false;
    if (members.some(id => !ids.has(id))) return false;
    if (scene.activeCamera !== null && kinds.get(scene.activeCamera) !== "camera") return false;
    if (objects.some(item => item.lookAtTarget && item.lookAtTarget !== "__none__" && !ids.has(item.lookAtTarget))) return false;
    return unique(scene.cameraAnimations) && scene.cameraAnimations.every(animation => validAnimation(animation, kinds));
}
/** @param {{id:string}[]} items */
function unique(items) { return new Set(items.map(item => item.id)).size === items.length; }
// 原生 category 是资产分类，目标种类只按 characters/cameras/props 的归属判断。
// 下面不求值动画、不改帧号，只核对保存数据内部是否引用了真实存在的对象。
/** @param {import("@illusion-realm/shared").AnimationDocument} animation @param {Map<string,string>} kinds */
function validAnimation(animation, kinds) {
    const range = animation.playRange;
    if (range && (range.startFrame >= range.endFrame || range.endFrame > animation.durationFrames)) return false;
    if (!unique(animation.tracks)) return false;
    const targets = animation.tracks.map(track => track.targetId).filter(id => id !== null);
    if (new Set(targets).size !== targets.length) return false;
    return animation.tracks.every(track => validTrack(track, kinds, animation.durationFrames));
}
// 通道与片段的检查和 shared 对应，主进程不依赖 Zod 或渲染层模块。
/** @param {import("@illusion-realm/shared").AnimationDocument["tracks"][number]} track @param {Map<string,string>} kinds @param {number} duration */
function validTrack(track, kinds, duration) {
    if (track.targetId && kinds.get(track.targetId) !== track.targetType) return false;
    if (track.aim?.target.objectId && !kinds.has(track.aim.target.objectId)) return false;
    if (!unique(track.channels) || new Set(track.channels.map(channel => channel.kind)).size !== track.channels.length) return false;
    return track.channels.every(channel => validClips(channel.clips, duration));
}
/** @param {import("@illusion-realm/shared").AnimationClip[]} clips @param {number} duration */
function validClips(clips, duration) {
    if (!unique(clips))
        return false;
    const sorted = [...clips].sort((a, b) => a.startFrame - b.startFrame);
    return sorted.every((clip, index) => clip.endFrame >= clip.startFrame && clip.endFrame <= duration
        && (index === 0 || sorted[index - 1].endFrame <= clip.startFrame)
        && unique(clip.keyframes) && new Set(clip.keyframes.map(key => key.frame)).size === clip.keyframes.length
        && clip.keyframes.every(key => key.frame >= clip.startFrame && key.frame <= clip.endFrame));
}

module.exports = { validDirectorReferences };
