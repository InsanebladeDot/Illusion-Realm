// 原素材选择事件保留，界面交给宿主的工程素材与全局资源库共同处理。
import { t as requireVue } from "./vue-vendor-CQe4N-Nh.js";
const { watch, onBeforeUnmount } = requireVue();
export default {
  props: { visible: Boolean }, emits: ["update:visible", "select"],
  setup(props, { emit }) {
    let revision = 0;
    // 关闭或卸载后忽略迟到结果；取消不会生成空片段或报成保存失败。
    async function select() {
      const current = ++revision;
      try {
        const items = await window.__videoSelectAssets();
        if (current !== revision || !props.visible) return;
        items?.forEach((item, index) => emit("select", item, { index, total: items.length }));
      } catch { /* 宿主适配器统一展示失败原因，原选择器只负责收起。 */ }
      finally { if (current === revision) emit("update:visible", false); }
    }
    watch(() => props.visible, value => { if (value) void select(); else revision++; }, { immediate: true });
    onBeforeUnmount(() => { revision++; });
    return () => null;
  },
};
