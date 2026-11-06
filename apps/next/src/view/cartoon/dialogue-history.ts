/** 合成文档的不可变历史：普通编辑压入起点，拖动只在结束时提交一份起点。 */
// 文档像叠起来的画稿，past放旧稿，present是桌上的稿，future放刚撤回的稿。
// 一旦在旧稿上重新画，之前的重做分支就不再适用，因此新修改清空future。
// 所有函数只操作传入对象，不依赖React、DOM、系统文件或单例编辑器。
// 图片数据是字符串，历史只共享不可变引用，不为每次移动复制解码像素。
// 每次更新创建新的图层或数组，旧稿才能保留修改前的位置和文字。
// 历史上限50步是内存边界，不代表当前画布最多只能有50个气泡。
// 当前选择不属于画稿内容，因此撤销不会替换另一个工具的选择状态。
// 这些助手共用一个History契约，界面不在按钮处重复拼装past/future。
// 测试可以独立验证分支与上限，但不能用纯函数通过代替真实拖动验证。
import type { DialogueDocument, DialogueLayer } from "./dialogue-types";

// 空白作品与“未加载用户数据”不同，默认即可添加模板并编辑。
// 用户截图中的背景不进入初始文档，避免把私人图片当作内置资源。
// 背景为空串意味着白画布，任何图片读取失败都不能把旧背景改成空串。
// 固定尺寸仅是新作品默认值，导入背景和切换横竖版可明确改变尺寸。
// 初始数组不会原地push，所有新增气泡经由不可变更新创建新数组。
// INITIAL由各实例读取，后续修改不写入该常量，因此实例不会互相污染。
// 字符串、数值和数组的纯结构可用于撤销，不包含浏览器节点或事件。
// 不把资源目录复制到文档，模板资源继续按templateId查找。
// History结构没有saved字段，不会误导界面显示已自动保存。
// future由撤销产生，不能把素材选择列表错误当作未来草稿。
// 空历史按钮保持禁用，调用函数本身也会处理边界。
// 每次取消选择不创建历史，用户撤销一次对应一个实际内容动作。
export const INITIAL_DOCUMENT: DialogueDocument = { width: 1280, height: 720, background: "", layers: [] };
export interface DialogueHistory { present: DialogueDocument; past: DialogueDocument[]; future: DialogueDocument[] }

// remember=false专用于手势中间帧，移动时present仍然真实更新。
// 它不是暂停渲染，也不是跳过内容改变；只是暂时不把中间帧压入past。
// 普通文字和数值编辑remember=true，下一次撤销可恢复其原值。
// transform只接收最新文档，避免连续事件拿旧闭包覆盖另一项修改。
// 例如先改字号再换颜色，两次函数式更新都基于各自最近的present。
// past超出50步时丢弃最旧的稿，不删除画布上的任何图层。
// future在任何新修改时清空，避免重做覆盖用户刚刚编辑的新内容。
// 没有持久化副作用，调用者可自行决定何时导出作品。
// 调用者不能原地修改传入文档，否则历史引用将指向同一被改坏的对象。
// 这里不克隆整个data URL，保持图片引用共享以控制内存使用。
// 选择同一模板添加第二次仍是新内容动作，可以单独撤销。
// 即使某个patch数值相同，函数也不尝试深比较整张图片来“省一步”。
// 深比较巨大字符串会拖慢输入，是否避免无效提交由具体控件处理。
// 局部控件失焦确认使用统一EditorFloatField，不在此改变输入格式。
export function changeHistory(current: DialogueHistory, transform: (doc: DialogueDocument) => DialogueDocument, remember: boolean): DialogueHistory {
  // transform只执行一次，避免带UUID创建等转换被重复求值产生两份内容。
  // 新past保存的是转换之前的present，不能把转换后的稿同时当起点与终点。
  // remember=false复用旧past数组引用，不为拖动每一帧复制50份历史列表。
  // future总被清空，包含不记中间历史的拖动帧，因为内容已经走上新分支。
  // 例如撤销颜色后拖动位置，原来被撤销的颜色重做不能覆盖新构图。
  // 这里没有副作用，抛错由调用转换的页面处理，而不是返回半修改的history。
  // 不深拷贝图片字符串，历史内存成本主要来自不同背景和层数据，而非重复解码画面。
  // 50步仍可能包含多张大背景，不能宣称这是严格固定字节数的内存上限。
  // 本函数不判断是否同值输入，字段确认与手势收尾分别拥有自己的无操作边界。
  return {
    present: transform(current.present),
    past: remember ? [...current.past, current.present].slice(-50) : current.past,
    future: [],
  };
}

// undo从past末尾取最近旧稿，redo从future开头取刚撤销的稿。
// 两个方向使用同一函数，边界为空时直接保留原对象。
// 保留原对象意味着React无需因一次无效撤销重新绘制全部素材。
// undo前把桌上当前稿放到future首位，连续撤销后的重做顺序才正确。
// redo把当前稿压回past，同时移除future刚取走的一项。
// 两边都保持最多50步，不能因为多次撤销重做绕过内存边界。
// 文档引用没有被修改，取回的颜色、方向和位置来自真实历史快照。
// 不根据图层数量猜测撤销对象，因为改字和改背景也需要历史。
// 删除之后撤销能恢复被删除的图层，选择是否恢复由界面独立决定。
// 历史不会自动选择末尾气泡，避免用户按撤销时焦点突然跳到别处。
// 导入背景同样是一个普通文档动作，撤销可恢复之前画布尺寸与背景。
// 手势没有结束前不触发本函数，避免进行到一半的拖动被压成错误分支。
// 只返回数据，不播放动画、不显示提示、不写本地文件。
// 测试该函数需要不同位置或文字的稿，不能拿相同对象充当多步历史。
// direction只能是联合类型，不能通过任意字符串指定读取别的字段。
// 此函数的结果仍满足相同History结构，UI可直接读取canUndo/canRedo。
export function travelHistory(current: DialogueHistory, direction: "undo" | "redo"): DialogueHistory {
  // 假设past=[A,B]且present=C，undo后应为past=[A]、present=B、future=[C]。
  // 再undo后future=[B,C]，redo必须先取B而非C，保证用户按原步骤向前恢复。
  // 因此undo取past尾、redo取future头，两者不是同一端的pop。
  // redo时将当前稿放回past尾，下一次undo才会回到刚才那一页。
  // 两个方向都只移动文档引用，不重新执行当初的图片读取或随机UUID生成。
  // 所以撤销添加再重做，气泡id仍是原id，不会新建一个名字相同的替代对象。
  // 空past和空future都返回current本身，按钮误调用不会清空当前作品。
  // 取数组元素之前已确认length，strict模式下不能用非空断言掩盖空边界。
  // 背景data URL也在快照中，恢复无需依赖原磁盘文件是否仍位于同一目录。
  // 选择仍由调用者处理；历史助手不会为了恢复稿件去聚焦一个已删除的输入框。
  if (direction === "undo") {
    if (!current.past.length) return current;
    return {
      present: current.past[current.past.length - 1],
      past: current.past.slice(0, -1),
      future: [current.present, ...current.future].slice(0, 50),
    };
  }
  if (!current.future.length) return current;
  return {
    present: current.future[0],
    past: [...current.past, current.present].slice(-50),
    future: current.future.slice(1),
  };
}

// patch只改变目标id对应图层，其他图层继续保留原对象引用。
// 同一模板创建两个实例时，它们templateId相同但id不同。
// 因此不能用templateId匹配，否则改一层文字会同时改掉全部同款气泡。
// values是调用者已校验的字段补丁，不在此处解析用户JSON或任意工程文件。
// 字号、文字、坐标、透明度都共用此边界，不各写一套选择判断。
// 选中项已被删除时匹配不到，文档保持其余内容，不创建幽灵图层。
// 组件收到的新数组会触发重绘，未修改图层本身不需要深拷贝。
// 原始text不截断，120字符限制属于输入控件的明确交互契约。
// 资源URL不在Layer字段中，patch无法把内置templateId改成文件系统路径。
// 本函数不会添加或删除图层，添加与删除仍由不同意图处理。
// 文档尺寸和背景由上层change提交，不混进图层局部patch。
// 自然坐标保留小数，缩小显示拖动时不会被强制跳到整像素。
// 历史记录发生在调用这个函数之外，手势可以选择是否remember。
// 因此相同patch也能用于实时拖动和失焦提交的数字字段。
// 不记录日志，文字和背景属于用户内容，不能输出到调试控制台。
export function patchDialogue(doc: DialogueDocument, id: string, values: Partial<DialogueLayer>): DialogueDocument {
  // 模板相同但id不同的两层是重要反例：只能目标层产生新对象。
  // map保持原有顺序，调整位置或字号不能把该气泡偷偷提到最前。
  // 未命中时仍返回结构合法的文档，不追加一个只有补丁字段的不完整图层。
  // 局部values不能被解释为路径，字符串内容也不能触发任何磁盘访问。
  // 不在这里自动生成UUID，因为patch是编辑现有层而不是创建新实例。
  // 目前调用方只提交编辑字段，不传id/templateId；这个类型不作为外部工程导入校验器。
  // 若未来开放工程JSON，必须单独验证不能由Partial类型替代运行时校验。
  return { ...doc, layers: doc.layers.map(layer => layer.id === id ? { ...layer, ...values } : layer) };
}
