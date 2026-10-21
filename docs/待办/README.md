# UI 优化待办与参考资源

更新：2026-10-21。这里集中保存本轮登录页与创建页的优化方案、样例、现状图和设计示意。产品接入与回归尚待完成，不能把方案图当作已经上线的效果。

| 方案 | 内容 | 状态 |
| --- | --- | --- |
| [登录页宽高与响应式优化](登录页-宽高与响应式优化.md) | 尺寸规则、滚动契约、分阶段待办、React/Tailwind/HTML 模板、测试矩阵与 PR 模板 | 独立 HTML 已验证；产品接入待办 |
| [创建页布局与操作体验优化](创建页-布局与操作体验优化.md) | 原图六处问题、建议示意、源码定位、表单/预览/图库方案、模板与验收 | 文档与静态示意已完成；产品实现待办 |
| [创建页参考图 HTML 实现](创建页-参考图HTML实现.md) | 最新蓝紫参考图、单文件 Tailwind 页面、裁切图片、响应式、交互与渲染截图 | 独立 HTML 已完成，26 项检查通过；产品接入待办 |

## 文件组织

```text
docs/待办/
├── README.md
├── 登录页-宽高与响应式优化.md
├── 创建页-布局与操作体验优化.md
└── 资源/
    ├── login/
    │   ├── original-centered.png / original-split.png
    │   ├── desktop-centered.png / desktop-split.png
    │   ├── short-register.png / mobile.png / small-register.png
    │   ├── index.html / login.html / serve.cjs
    │   └── source.html / interactions.js / build.cjs / verify.cjs
    └── create/
        ├── current.png
        ├── annotated.png / annotated.svg
        └── proposed.png / proposed.svg
```

- 登录页图片区分用户原图与独立 HTML 的真实渲染截图。
- 创建页的 `proposed` 明确是静态设计示意，不是已接入应用的截图；`annotated` 为原图标注。
- 可运行文件和源码模板均随资源归档，文档使用相对链接，不依赖个人临时目录。
- 最新创建页实现归档在 `资源/anime-create/`，包括 `index.html`、完整源码、原图、裁切 WebP、桌面与手机截图。直接打开 [创建页 HTML](资源/anime-create/index.html)，或运行 `node docs/待办/资源/anime-create/serve.cjs` 后访问 <http://127.0.0.1:4179/>。
- 历史位置 `docs/login-layout-optimization-todo.md` 与 `docs/prototypes/login-layout/` 已迁移到本目录，后续只维护此处。

## 查看样例

直接打开[登录页预览控制台](资源/login/index.html)，或者从仓库根目录运行：

```powershell
node docs/待办/资源/login/serve.cjs
```

然后访问 <http://127.0.0.1:4178/>。若同端口已有旧预览服务，先结束自己启动的那一份再启动归档版本；不要终止未知进程。页面只在本机开放，按钮不连接账户 API。

## 新方案模板

```md
# 页面 / 功能优化待办
日期：YYYY-MM-DD
状态：审查 / 示意 / 独立预览 / 已接入 / 已回归

## 原图与问题标注
## 最影响使用的三个问题
## 信息顺序与尺寸规范
## 源码现状与业务边界
## 分阶段待办
## 结构和交互模板
## 宽窄屏、长文本、错误与空态验收
## 执行结果与未验证项
```

每个方案有对应资源子目录。截图记录尺寸、主题和来源；演示数据明确标注；修改过期文档链接后检查目标存在。
