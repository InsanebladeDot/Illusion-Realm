/** 只格式化显示时间，不驱动播放器或改写工程。 */
// 时间码先转整数帧，再拆成时分秒帧，避免 29.999 秒显示成 00:00:29:30。
// 以帧作为共同刻度，类似把尺子先换成毫米再读厘米，不混用小数秒余数。
// fps 的帧尾从零开始，30fps 的最后合法帧号是 29。
// time 为负数或非有限值时显示起点，不输出 NaN 或负号时间码。
// 非整数/零帧率回落到演示帧率，不把未知值继续参与除法。
// 此函数只是文字格式化，不会校正工程参数或移动播放头。
// 总时长和当前时间共用它，不能一个显示秒一个显示毫秒。
// 小数误差在乘帧率后补极小容差，保持 12 秒精确落在第 360 帧。
// 小时可以超过两位，padStart 只补足最小宽度，不截断长工程。
// 字段之间固定冒号，数字是行业时间码，不用中文单位挤占控制栏。
// 帧率显示仍取有效整数，项目数据不会因格式化被写回。
// 不读取 Date 或当前时钟，服务端与客户端首帧保持相同文本。
export function formatEditorTimecode(time: number, fps: number) {
  // 只接受正整数帧率；将 0 当作除数会把后续每个字段都变成非法文本。
  // 容差小于一帧的千万分之一，只处理二进制小数误差，不人为跳到下一帧。
  // 帧号取整后再求余，保证分钟进位和帧尾使用同一个整数时间源。
  // 秒数超过一小时仍逐字段拆分，不能使用只适合短片的 mm:ss 格式。
  const rate = Number.isInteger(fps) && fps > 0 ? fps : 30;
  const frame = Math.floor((Number.isFinite(time) ? Math.max(0, time) : 0) * rate + 1e-7);
  const seconds = Math.floor(frame / rate);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60, frame % rate].map(value => String(value).padStart(2, "0")).join(":");
}
