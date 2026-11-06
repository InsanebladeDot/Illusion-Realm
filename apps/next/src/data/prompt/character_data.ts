/**
 * 角色库的模块入口；原始数据迁入 shared，供创建页和主进程共用。
 * 字段保留用户提供的名称、作品、性别、发色、瞳色及参考热度。
 * 不再写入 window，避免构建或主进程读取时依赖浏览器环境。
 * 空属性仍表示资料缺失，不能根据角色名自动补色或猜作品。
 * JSON 是唯一维护副本，安装资源直接复制它，不另做人工数据镜像。
 * 此入口保留原路径，旧参考代码也可以显式导入 characterData。
 * 导出后由调用者决定消费方式，SSR 不会再触发 window 未定义。
 */
import characterData from "../../../../../packages/shared/src/data/character-reference.json";

export { characterData };
export default characterData;
