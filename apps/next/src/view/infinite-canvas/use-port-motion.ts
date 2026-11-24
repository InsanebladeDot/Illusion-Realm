"use client";

// 端口的外壳仍固定在图引擎原位，只有圆圈和加号随鼠标轻移。
// 像门牌上的吊饰被风吹动，门的位置不变，连线仍落在同一扇门上。
// 倾斜只作用于内容板，不改变媒体状态、节点位置或保存文件。
// 真实 Handle 保持原位，避免图引擎缓存的锚点和眼睛看到的命中范围互相追逐。
// 不 transform React Flow 节点外层，外层已有镜头和世界位置变换。
// 如果在外层叠变换，拖动换算和撤销位置都会把装饰误当成工程位置。
// 圆圈显示层禁止指针命中，鼠标事件始终落回同一个 Handle。
// 附近命中范围由端口伪元素补充，不再叠一颗拥有独立连接逻辑的按钮。
// 所有节点类型共用本实现，视频、图片和文字只注入自己的节点身份。
// 没有端口的便签不会产生额外可操作区域，查询为空时自然没有圆圈可移动。
// 视频的真实像素跟着内容板倾斜，不用只移动封面来制造悬空错觉。
// 媒体事件、解码状态和当前播放时间仍在原预览组件中管理。
// 这种 3D 是 CSS 展示反馈，不建立新的 Three.js 场景或逐帧渲染循环。
// 停在原位不需要反复执行动画计时器，只有鼠标事件才写局部变量。
// 写 CSS 变量不提交 React 状态，参数面板不会因鼠标每一像素重渲染。
// DOM 读取限定在当前端口，不遍历全图卡片或重新计算整个图的包围盒。
// 连接状态只订阅布尔值，不订阅橡皮筋每一像素的末端坐标。
// 因此拖线不会让每张卡片跟着连接线一起刷新 React JSX。
// 用户要求减少动态时完全停止偏移计算，而不只是取消 CSS 过渡。
// 否则无过渡的即时追随仍然会动，不符合减少动态的实际含义。
// 主题不参与计算，浅色与深色读取相同的几何规则。
import { useEffect, type RefObject } from "react";
import { useConnection, useStore } from "@xyflow/react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

// 所有输入都是屏幕像素，结果也先限制在十五像素，最后才换成节点局部长度。
// 因此放大镜头不会让端口在屏幕上追出去几十像素。
// getBoundingClientRect 包含当前镜头缩放，offsetWidth 则是端口未缩放的布局宽度。
// 两者相除得到这里需要的局部换算比例，不读取另一张节点的尺寸。
// 到鼠标的距离从固定圆心计算，不从已经偏移的圆圈再追下一步。
// 这像用固定钉子拴住一根短绳，而不是让钉子也跟着绳头跑。
// 如果从偏移后的圆圈重复计算，静止鼠标也可能造成逐步漂移和抖动。
// 轻微跟随使用距离的一部分，靠近时不会突然完全贴到指针上。
// 远端再截到十五屏幕像素，不因对角线位移让总长度超过上限。
// 横纵两方向共享一个比例，斜向跟随也保持指针方向。
// 除以 zoom 发生在屏幕上限判断之后，不能先限制局部像素再被镜头放大。
// 分母为零时取一，只防止圆心的零距离计算产生无效数值。
// 端口周围二十像素从边缘算起，中心到边缘的半宽也计入有效范围。
// 指针进入透明命中区时可以立即反馈，不必先碰到那条很细的圆线。
// 超出范围把偏移置零，而不是保留上一次恰好有效的位移。
// 不在这里保存上次 pointerEvent，避免卸载以后还有引用占住旧 DOM。
// 接收端才倾斜，发出连接的卡片不因按住自己的端口而产生目标反馈。
// 没有连线时保留端口跟随，但不让整块卡片因普通经过就倾斜。
// 同一节点不能给自己提供目标倾斜，连接起点身份在订阅边界已经排除。
// 纵向角度最多两度，横向固定为轻微受力方向，不旋成夸张的立方体。
// 倾斜只表示靠近接收端，不代表类型校验已经通过或连线已保存成功。
// 是否允许连接仍由原图引擎与 reducer 的重复、类型和循环校验决定。
// 本函数不主动创建连线，也不会因为鼠标进入范围就改变选择集。
function followPort(node: HTMLElement, port: HTMLElement, event: PointerEvent, connecting: boolean) {
  const rect = port.getBoundingClientRect();
  // 这里读的是固定 Handle 的矩形，不是 firstElementChild 的视觉矩形。
  // 后者在当前事件前已经可能偏移，拿它当基准会让用户感觉圆圈被鼠标推着逃走。
  // clientX 和 rect.x 都相对浏览器视口，二者相减不需要再减导航或标题栏宽度。
  // 页面中主区位置变化由浏览器矩形体现，不维护一份会过期的固定左偏移。
  const dx = event.clientX - rect.x - rect.width / 2;
  const dy = event.clientY - rect.y - rect.height / 2;
  const distance = Math.hypot(dx, dy);
  const zoom = rect.width / port.offsetWidth || 1;
  // 例如镜头为二倍，十五屏幕像素换成七点五局部像素，再由浏览器放大回来。
  // 镜头为半倍则写三十局部像素，最后在屏幕仍然只显示十五像素。
  // 上限针对圆圈中心的位移，不包含端口本来的半径。
  // 文字端口与视频端口半径不同，但这不会让它们追随的距离上限不同。
  const reach = rect.width / 2 + 20;
  // 真正边缘到达二十像素以外时 strength 为零，不能继续吸附远处的指针。
  // 圆形范围进一步过滤透明伪元素方框四角，四角命中不代表可以越过距离约束。
  // 指针在固定圆心上时 dx、dy 都为零，因此不需要强行制造一点摆动。
  // reach 始终大于零，纵向受力比例不会除以零。
  const strength = distance <= reach ? Math.min(.55, 15 / (distance || 1)) / zoom : 0;
  port.style.setProperty("--port-x", `${dx * strength}px`);
  port.style.setProperty("--port-y", `${dy * strength}px`);
  // 横纵变量使用 px 后缀，CSS 不需要猜测这个数值究竟是长度还是倍率。
  // 变量写在各自端口上，两侧即使复用变量名也互不覆盖。
  // 卡片倾斜变量则写在 node 上，只有内部内容板消费它们。
  // 这种作用域区分也保证参数面板不会被当作卡片内容一起旋转。
  const tilt = connecting && port.classList.contains("target") && distance <= reach;
  // class target 来自现有 Handle 类型，不根据端口左右屏幕位置猜测输入输出。
  // 将来镜头平移或节点宽度变化，接收端的业务身份不会随几何改变。
  // 倾斜方向在卡片自己坐标系中解释，和圆圈屏幕位移使用的 zoom 换算不同。
  // 角度不乘镜头倍率，放大只增加显示面积，不应把两度变成四度。
  node.style.setProperty("--node-tilt-x", tilt ? `${Math.max(-2, Math.min(2, -dy / reach * 2))}deg` : "0deg");
  node.style.setProperty("--node-tilt-y", tilt ? "-2.5deg" : "0deg");
}

// 结束连线或离开端口后回正，不把上一条连线的倾斜带到下一次操作。
// removeProperty 恢复样式表的默认值，不保存一份可能过期的初始内联 transform。
// 这使卡片原有的圆角、比例和媒体适配仍由原 CSS 负责。
// 左右端口都重置，快速从右侧绕到左侧不会留下另一侧偏移。
// 不删除整个 style，卡片自定义宽高和其他展示变量必须保留。
// 卡片的高度属于工程数据，跟随偏移属于一次鼠标交互，不能混为一类清理。
// 只在当前 host 下查询 Handle，另一个画布实例的端口不会被清零。
// 结束效果不触发节点更新，所以自动保存不会因回正额外写盘。
// 即使端口已经被移除，空查询也能安全完成卸载清理。
// 清理不暂停媒体，悬停结束不是停止播放的业务意图。
function resetMotion(node: HTMLElement) {
  // 默认角度由 CSS fallback 给出，所以删掉变量就会平滑回到零度。
  // 不能把 transform 整体写成 none，那会掩盖组件未来合法的基础视觉变换。
  node.style.removeProperty("--node-tilt-x");
  node.style.removeProperty("--node-tilt-y");
  node.querySelectorAll<HTMLElement>(".react-flow__handle").forEach(port => {
    // 清理端口追随不删除 --port-zoom，它仍负责静态命中区域的实际屏幕大小。
    // 因为减少动态只关闭动画，不应该同时缩小可连接的点击范围。
    port.style.removeProperty("--port-x");
    port.style.removeProperty("--port-y");
  });
}

export function usePortMotion(host: RefObject<HTMLElement | null>, id: string) {
  // 原生拖线和点击连线分别读取图引擎现有状态，不再维护第三个 pending 起点。
  // 选择器返回布尔值，因此末端位置变化但连接仍在继续时不会通知本卡重渲染。
  const draggingConnection = useConnection(connection => connection.inProgress && connection.fromNode.id !== id);
  // inProgress 是类型分界，只有真正开始连接时 fromNode 才具有可读的节点身份。
  // 这里不假定有一个全局 sourceId，也不把选中节点误当作连线起点。
  const clickingConnection = useStore(state => Boolean(state.connectionClickStartHandle && state.connectionClickStartHandle.nodeId !== id));
  // 点击方式的起点由 React Flow 保存，按 Escape 的现有取消入口会一并清空它。
  // 因此本 Hook 不再加一个可能忘记清理的 pendingConnection 状态。
  // 两个连接方式取或值，用户用哪一种都可获得相同的目标受力反馈。
  // 尚未接近端口时只有这个允许条件，没有自动施加卡片旋转。
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  // zoom 只在镜头比例改变时通知；普通平移不需要重设端口的局部命中范围。
  // 二十屏幕像素除以 zoom 后传给 CSS，缩小镜头时命中区也不会缩成几像素。
  const zoom = useStore(state => state.transform[2]);
  // 只取 transform 的第三项，不订阅平移横纵坐标，平移画布不会重装本监听。
  // 这个订阅不写节点尺寸，切换镜头也不会触发工程自定义卡片大小变更。
  const connecting = draggingConnection || clickingConnection;
  useEffect(() => {
    // 所有浏览器读取都在挂载后执行，静态导出阶段没有 window 或 DOM 依赖。
    // 每次连接状态变化先回正，避免结束时指针没有移动而旧倾斜一直停留。
    const node = host.current;
    if (!node) return;
    node.style.setProperty("--port-zoom", String(zoom));
    // 先写倍率再检测 reduced，关闭动态的用户依然得到一致的端口接近范围。
    // 使用 String 转换单个已知数值，不把 CSS 表达式或用户文本拼进变量。
    resetMotion(node);
    if (reduced) return;
    // 减少动态时不安装移动监听，静态端口仍保留自己的点击和键盘连接行为。
    // 查询订阅使用项目现有的 resize 与 visibility 恢复机制，不另建主题开关。
    const move = (event: PointerEvent) => {
      // closest 接受 SVG 子元素命中，不能要求 target 必须等于 Handle 的 div。
      // contains 再限定到当前卡片，防止未来插槽包含其他实例时误写外部端口。
      // 没碰到端口时回正，意味着从端口移进卡片正文也能立即退出受力反馈。
      // 这比只监听整张卡片 pointerleave 更准确，因为正文也在同一个 host 内。
      const port = event.target instanceof Element ? event.target.closest<HTMLElement>(".react-flow__handle") : null;
      if (port && node.contains(port)) followPort(node, port, event, connecting);
      else resetMotion(node);
    };
    const reset = () => resetMotion(node);
    node.addEventListener("pointermove", move);
    // 移动监听在卡片局部；不在 window 上为每张节点逐像素读取布局。
    // 圆圈外扩范围产生的事件仍冒泡到本卡，因此这一处就覆盖两侧端口。
    node.addEventListener("pointerleave", reset);
    // pointerleave 不冒泡子节点离开，所以子元素间来回移动不会导致反复拆装监听。
    // move 中的目标检测负责内部切换，leave 负责真正离开整卡时的最后一道清理。
    window.addEventListener("blur", reset);
    // 失焦不一定产生 pointerleave，所以单独观察窗口失焦来收掉悬停效果。
    // 重新聚焦后等待新的真实指针事件，不凭过期坐标恢复旧偏移。
    return () => {
      reset();
      // Effect 重装、节点删除和整页离开都拆掉旧监听，防止重复叠加反馈。
      // 每张卡的 reset 引用独立，清理一张卡不会影响另一张卡的事件订阅。
      node.removeEventListener("pointermove", move);
      // 清理时沿用安装时的同一个 move 函数引用，不能重新创建一个等价箭头函数。
      // 否则 removeEventListener 找不到旧函数，来回连线后会累积多个回调。
      node.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
    };
  }, [host, connecting, reduced, zoom]);
}
