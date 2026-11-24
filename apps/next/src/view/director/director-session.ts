// 宿主只拥有关闭请求，不能从外面直接改人物、机位或动画。
// 关闭需要等图片和文档写入完成，失败时编辑器继续保留在原处。
export interface DirectorSession {
  close: () => Promise<void>;
}
