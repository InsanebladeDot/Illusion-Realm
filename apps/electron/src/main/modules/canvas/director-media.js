// 场景预览、全景和图片板都是真实工程资源，必须随工程包一起搬走。
// 返回引用位置而不是复制一份图片数据；解包只改自己的文档副本，不更名用户源文件。
/** @param {import('@illusion-realm/shared').DirectorScene | undefined} scene */
function imageReferences(scene) {
  /** @type {{path:string, set:(value:string)=>void}[]} */
  const result = [];
  if (!scene) return result;
  if (scene.previewPath) result.push({ path: scene.previewPath, set: value => { scene.previewPath = value; } });
  if ("characters" in scene) {
    if (scene.panoramaUrl) result.push({ path: scene.panoramaUrl, set: value => { scene.panoramaUrl = value; } });
    for (const prop of scene.props) if (prop.imageUrl) result.push({ path: prop.imageUrl, set: value => { prop.imageUrl = value; } });
  }
  return result;
}
module.exports = { imageReferences };
