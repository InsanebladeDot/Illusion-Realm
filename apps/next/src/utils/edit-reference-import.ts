/** 追加 H3 参考图：复用浏览器实际解码，整批验证后才接管 URL，失败保留旧素材。 */
import { loadMaskImage } from "@/utils/mask-image";
import { useAnimaEditStore, type EditSource } from "@/stores/use-anima-edit-store";
import { t } from "@/i18n";

export async function appendEditReferences(files: File[], replaceIndex?: number) {
  const state = useAnimaEditStore.getState();
  if (state.taskId || state.importing || !files.length || state.editWorkflow !== "minimax-image-edit") return;
  const count = state.references.length + (state.source ? 1 : 0);
  if (count + files.length - (replaceIndex === undefined ? 0 : 1) > 8) { state.patch({ error: t("create.animaEdit.referencesHint") }); return; }
  state.patch({ importing: true, error: "" });
  const pending: EditSource[] = [];
  try {
    for (const file of files) await decodeReference(file, pending);
    // importing 是同步门闩；批次完成前禁止替换、移除和重复导入。
    state.setResult(null);
    const items = [...(state.source ? [state.source] : []), ...state.references];
    if (replaceIndex === undefined) items.push(...pending);
    else { const old = items.splice(replaceIndex, 1, pending[0])[0]; if (old) URL.revokeObjectURL(old.url); }
    state.patch({ source: items[0], references: items.slice(1) });
  } catch (error) {
    pending.forEach(item => URL.revokeObjectURL(item.url));
    state.patch({ error: error instanceof Error ? error.message : t("create.maskEditor.loadFailed") });
  } finally { state.patch({ importing: false }); }
}

async function decodeReference(file: File, pending: EditSource[]) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || !file.size || file.size > 25 * 1024 * 1024) throw Error(t("create.animaEdit.invalidFile"));
  const url = URL.createObjectURL(file);
  // 先登记所有权，解码或像素检查抛错时批次 catch 也能释放本张。
  const item = { file, url, width: 0, height: 0 }; pending.push(item);
  const decoded = await loadMaskImage(url);
  if (decoded.naturalWidth * decoded.naturalHeight > 40_000_000) throw Error(t("create.animaEdit.tooLarge"));
  item.width = decoded.naturalWidth; item.height = decoded.naturalHeight;
}

/** 删除首图时提升下一张；输出尺寸也随新的首图变化，顺序没有隐藏镜像。 */
export function removeEditReference(index: number) {
  const state = useAnimaEditStore.getState();
  if (state.taskId || state.importing) return;
  const items = [...(state.source ? [state.source] : []), ...state.references];
  const removed = items.splice(index, 1)[0];
  if (!removed) return;
  URL.revokeObjectURL(removed.url); state.setResult(null);
  state.patch({ source: items[0] ?? null, references: items.slice(1), error: "" });
}
