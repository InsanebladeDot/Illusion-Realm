# Agent 本地模型查询契约

`list_local_models` 仍通过现有宿主工具桥返回字符串，但字符串内容是一份完整 JSON，不再是按缩进排版的清单。分类发现、来源资料读取和系列判断与 `list_loras`、生成前检查共用实现。

## 最短生图流程

1. 未指定模型时调用 `list_local_models({"kind":"diffusion","series":"anima"})`。选择 `usable: true` 的结果；无合适结果时说明原因，请用户配置目录或选择模型，不猜文件名。
2. 需要扩展时调用 `list_loras({"model":"上一步返回的完整name","query":"所需关键词"})`，只使用 `compatible: true` 的条目。无需扩展则跳过。
3. 调用 `generate_image({"prompt":"用户所需提示词","model":"完整name","loras":[{"name":"兼容LoRA的完整name","strength":1}]})`。扩展可省略或传空数组。

`name` 如 `Anima/角色/版本/model.safetensors`，相对于对应模型类别根，包含全部子目录和真实扩展名。它不是绝对路径，也不加 `diffusion_models/` 类别前缀。必须原样传递，不根据显示标题补目录、改名或补扩展名。生成前仍会核对本地与 ComfyUI 清单；一次纠正后仍失败应询问用户，禁止反复猜路径。

## 参数与类别

| 参数 | 规则 |
| --- | --- |
| `kind` | 默认 `all`；规范值为 `checkpoint`、`diffusion`、`lora`、`text_encoder`、`vae`、`model_patch` |
| `series` | 可按已有证据筛选 `anima`、`sdxl`、`wan2.1`、`wan2.2`、`minimax` 等；支持 `unknown`、`conflict`；省略或 `all` 不筛选 |
| `query` | 完整相对名的子串搜索，最多 200 字符，不区分大小写 |
| `offset` | 非负安全整数，默认 0 |
| `limit` | 1–100 的整数，默认 40 |

`unet`、`diffusion_models`、历史拼写 `diffrent_models` 都归 `diffusion`；`loras`、`checkpoints`、`clip`、`text_encoders`、`model_patches` 也有对应别名。旧 `search` 参数等同 `all`。

配置检索路径时，只扫描标准类别子目录，不把任意散落文件按体积猜成主模型。未配置检索路径时使用设置里的独立 Checkpoint、LoRA、Diffusion 目录；不推测这些目录的兄弟位置。

## 返回结构

```json
{
  "version": 1,
  "status": "ok",
  "roots": [{"id":"diffusion_models","kind":"diffusion","status":"available","groups":1,"files":1}],
  "models": [{
    "name":"Anima/example/model.safetensors",
    "kind":"diffusion",
    "series":"anima",
    "rootId":"diffusion_models",
    "bytes":123,
    "usable":true,
    "reason":"本地前置条件通过，提交时仍须核对ComfyUI清单及实际加载结果",
    "evidence":"baseModel: Anima",
    "trainedWords":[],
    "validation":"local_precheck"
  }],
  "total":1,
  "offset":0,
  "limit":40,
  "returned":1,
  "nextOffset":null,
  "truncated":false,
  "filters":{"kind":"diffusion","series":"anima","query":""},
  "notes":["工具中的操作说明与边界提示"]
}
```

上例是小文件夹具示意，不是真实权重。`bytes` 为文件精确字节数，未知为 `null`。只对当前页读取文件信息，不为计算大小顺序读取 GB 级权重内容。

`usable` 仅针对当前 `generate_image` 的本地前置条件：Anima 要求 diffusion，SDXL 要求 checkpoint；其他生成系列目前只提供查询。LoRA 未绑定主模型时返回 `null`，须查询兼容性。辅助组件返回 `false` 表示不能直接填主模型或 LoRA 参数，不表示文件损坏。

`usable: true` 不证明权重格式、编码器组合、显存或远端加载正常；没有真实试载。系列来自已有来源资料与目录标签，不按文件大小猜架构。证据冲突会保留原因。主模型完整相对名跨根重复时，不允许通过 `kind` 或 `series` 筛选把歧义藏掉。

`roots` 不公开绝对目录，状态区分 `available`、`invalid`、`missing`、`unreadable`。根摘要 `files` 是全根扫描数，`total` 是过滤后的命中数。扫描器沿用跳过不可读子目录的行为，并非全盘完整性审计。

`status: not_configured` 提示到设置 → 模型路径配置；`empty` 结合根状态区分空目录、无关键词命中与目录不可用。offset 超尾时仍为 `ok`，只是空页。

续页原样使用 `nextOffset`，`null` 表示结束。`list_loras` 同样支持分页，结果数组仍叫 `loras`。这是实时扫描后的偏移分页，跨页期间增删文件应从 0 重查，不提供事务快照。

## 验证与生效

`node scripts/verify-agent-loras.js`：30 组通过，覆盖真实临时目录、兼容预检、工具转发、正式图构建、分类、精确字节及 45 项分页。原先 6 组独立目录测试已整合到同一套夹具，避免重复维护测试基础设施。

本机真实模型目录只读查询已发现 6 个 Anima 主模型，返回完整相对名及精确字节。没有执行真实 GPU 推理。Agent 事件桥检查 11/11 通过。

开发运行需完全重启主进程；安装版需重新打包安装，旧 EXE 不会自动获得新工具代码。本轮没有推送、发布或重打安装包。

注释按任务开始快照的新增/替换行统计，JS 使用 TypeScript AST 评论范围并人工核对含义；旧上下文不计入。

| 文件 | 有效注释 C | 代码 B |
| --- | ---: | ---: |
| `host-tools.js` | 24 | 10 |
| `lora-tools.js` | 63 | 22 |
| `model-query.js` | 75 | 32 |
| `model-catalog.js` | 139 | 60 |
| `verify-agent-loras.js`（测试） | 98 | 42 |

业务合计 301 / (301 + 124) = **70.82%**；测试 98 / (98 + 42) = **70.00%**。例如注释明确区分“本地检票条件”和“实际列车发车”（静态检查与真实加载），并解释 `nextOffset` 与过滤后 `total` 的关系。
