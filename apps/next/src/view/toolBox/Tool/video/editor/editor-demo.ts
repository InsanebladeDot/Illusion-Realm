/**
 * UI-01 的只读工程样例，不是项目保存格式，也不是探测媒体后得到的数据。
 * 所有区域从这里取同一组值，避免预览为 12 秒而时间轴却显示另一个位置。
 * 时间像共用的尺子：片段起点和长度都用秒，展示层统一换成百分比。
 * 30 秒是项目时长，不能把五个素材的时长相加当作项目时长。
 * 当前帧位于 scene_02 内，右侧属性和预览使用这个确定的片段。
 * 演示素材只引用从已确认参考图裁出的本地静态图片，不访问网络。
 * 裁图用于封面与静态画面，不代表已经完成视频解码或缩略图生成。
 * 两个视频都没有内嵌音轨，A1 和 A2 是独立的音频示意轨。
 * 图片素材没有源时长；它在时间轴中的 10 秒属于片段实例时长。
 * 稳定 ID 与显示名分离，后续筛选或重命名不会改变素材身份。
 * UI-01 不向全局 store 或用户文档写入这些数据，离开页面即可卸载。
 * 后续真实项目接入应在视图边界适配，不直接修改这个样例假装读盘成功。
 */
import sceneOne from "@/assets/video-editor-demo/scene-01.webp";
// 统一的静态媒体模块使列表、节目画面和轨道能共享同一个资源引用。
// Next 在构建时复制资源，打包后仍由 app:// 提供，不依赖原图所在磁盘目录。
// 这里只导入图片，不创建 video/audio DOM，也不会建立解码会话。
import sceneTwo from "@/assets/video-editor-demo/scene-02.webp";
// 背景图与视频封面有不同身份，不能按相同像素或相似名称合并素材。
// 小封面来自参考图原有缩略图，仅用于骨架阶段的视觉比对。
// 后续素材阶段可以替换来源，时间轴仍通过 assetId 找到同一素材。
import background from "@/assets/video-editor-demo/background.webp";

// 常量只包含展示需要的工程参数，不夹带输出路径或真实文件系统权限。
// 未保存描述来自界面文案，不能将这里的静态值当作已保存本地的证据。
// 帧率用于时间码展示，UI-01 没有时钟，也不执行实时播放或 seek。
// 不通过定时器推动 currentTime，避免把演示动画误认为播放成功。
// 素材与片段选择的交互留给 UI-03/UI-06，此阶段只呈现已确认默认状态。
export const DEMO_PROJECT = { width: 1920, height: 1080, fps: 30, duration: 30, currentTime: 12 } as const;

// 同一素材行接受不同 kind，图像与音频的差别由内容槽表达。
// 音频不虚构图片封面，波形使用独立静态图形占位。
// duration 为 null 代表没有源时长，不在界面显示“图片 · 0 秒”。
// 声明为只读数组，避免后续交互意外修改模块级样例影响其他实例。
// 这里只用 UI 实际需要的字段，不提前复制 shared 的完整媒体探测协议。
// 资源描述不是本地文件路径，不能传入导出或 FFmpeg 处理接口。
// 两个视频长度相同，正确渲染后在时间轴上必须等宽。
// voice 的 6 秒与背景音乐的 30 秒都有各自的稳定素材身份。
// 类型来源于字面量，消费者不需要 any 或根据扩展名猜测媒体类型。
// 源文件名保留扩展名，后续属性区与轨道标签可以逐项核对。
// scene_02 的默认高亮只是样例呈现，不暗示素材选择已联动到属性面板。
// 缩略图没有写入 prompt/模型参数，本轮不会接入生成任务。
export const DEMO_ASSETS = [
  { id: "scene-01", name: "scene_01.mp4", kind: "video", duration: 8, cover: sceneOne },
  { id: "scene-02", name: "scene_02.mp4", kind: "video", duration: 8, cover: sceneTwo },
  { id: "background", name: "bg_01.png", kind: "image", duration: null, cover: background },
  { id: "voice", name: "voice_01.wav", kind: "audio", duration: 6, cover: null },
  { id: "music", name: "bgm.mp3", kind: "audio", duration: 30, cover: null },
] as const;

// 片段保存工程起止秒数而不是 CSS left/width，后续缩放无需改样例时间。
// clipId 与 assetId 分离，未来同一素材可以在时间轴重复出现且各自选中。
// V1 的 8–10 秒、18–20 秒是明确空隙，不能靠 flex 均分把它们抹掉。
// A1 从 10 秒开始，A2 从 0 秒开始，不照搬参考概念图的错误对齐。
// 所有片段都在 30 秒项目范围内，UI-01 不裁掉非法素材来伪造成功。
// 只有 scene_02 片段选中，避免三个区域分别维护互相矛盾的默认选择。
// 这里不包含修剪手柄的执行逻辑，描边与把手只是静态占位。
// locked/muted/solo 的交互属于后续时间轴任务，不生成隐藏业务状态。
// 无真实音频采样数据，轨道内的装饰波形不得用于计算音量。
// 片段长度由 end-start 求得，避免复制 length 后改一处漏另一处。
export const DEMO_CLIPS = [
  { id: "clip-01", assetId: "scene-01", track: "V1", start: 0, end: 8 },
  { id: "clip-02", assetId: "scene-02", track: "V1", start: 10, end: 18 },
  { id: "clip-bg", assetId: "background", track: "V1", start: 20, end: 30 },
  { id: "clip-voice", assetId: "voice", track: "A1", start: 10, end: 16 },
  { id: "clip-music", assetId: "music", track: "A2", start: 0, end: 30 },
] as const;
