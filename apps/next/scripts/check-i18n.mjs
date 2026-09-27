/**
 * i18n 逃逸断言（ratchet）：界面文案必须走词条表，不允许继续硬编码中文字面量。
 *
 * 用法：
 *   node scripts/check-i18n.mjs            # 与 BASELINE 比较，只减不增
 *   node scripts/check-i18n.mjs --list     # 打印每个文件剩余数量，用于挑下一批迁移
 *   node scripts/check-i18n.mjs --file src/view/create/PromptSection.tsx
 *
 * 为什么要 AST 而不是正则：本项目注释几乎全是中文，正则会把注释一起算进去。
 * 这里用 TypeScript 自己的 parser，只统计**可能面向用户**的字符串：
 *   1. JSX 文本节点里的中文
 *   2. JSX 表达式里的中文（属性值 `aria-label={c ? "收起" : "展开"}`、
 *      子元素 `{cond ? "添加中…" : label}` 这类三元分支）
 *   3. 调用表达式实参里的中文字面量（`showToast("已复制")`、`handleNavClick(e, "/", "首页")`），
 *      排除明显非文案的 helper（console / path / fs / JSON / String …）
 *   4. 对象字面量里 title / label / placeholder / description / hint / emptyText …
 *      属性的中文值（组件内的配置表，如分类名）
 *   5. 模板字符串里的中文（含 `${}` 插值）
 *   6. 参数默认值里的中文（可选 props 的回退文案；写在函数体外求值的位置，最容易漏）
 *
 * 已知不覆盖（需要人工过一眼）：
 *   - 模块级常量里的「展示用映射表」值，如 `const SOURCE_LABELS = { manual: "手动指定" }`
 *     ——属性名不像 UI 字段，自动判定会误伤 src/data 下的素材数据
 *   - 解构参数里的默认值 `function f({ a = "中文" })`
 *   这两类历史上各漏过一处，迁移时靠人工复查补上；新增时要留意。
 *
 * 故意不算的：注释（含 JSDoc）、import 路径、console.*、data-testid、
 * 以及**词条表本身**（`src/i18n/**` —— 那里的中文就是迁移的目标，不是逃逸）。
 * 也就是说本脚本统计的是「迁移工作量」，不是「所有中文字符」。
 *
 * 注意：`src/data/**` 里的素材名（画作标题、角色名、字体名）属于**内容数据**而非界面
 * 文案，是否入表由业务决定；本脚本照样计数，因此基线不会归零，这是预期行为。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * 基线：只减不增。每迁完一批就把这个数字调成脚本报出的当前值。
 * 负向对照：随便在任意组件里加一句中文 JSX 文本，本脚本必须 exit 1。
 *
 * 65 → 66（2026-09-23）：表情数据集（`src/data/prompt/expression.ts`）里有一条条目自带
 * 中文 `description`。那是**内容数据**（与 `galleryPaintings` / `roles` / `cartoonFonts`
 * 同一类），不是界面文案 —— 按本脚本的口径照样计数，所以基线 +1。
 * 新增的界面文案（表情库 / 表情分类 / 已覆盖「表情」）全在词条表里，不占这个数字。
 */
const BASELINE = 66;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(HERE, "..", "src");
/** 词条表目录：里面的中文正是迁移目标，不能算作逃逸 */
const I18N_DIR = `${path.join(SRC_DIR, "i18n")}${path.sep}`;

/** 明显不是界面文案的 helper：这些调用的中文实参不算 */
const NON_UI_CALLEES = new Set([
  "require",
  "String",
  "Number",
  "Boolean",
  "parseInt",
  "parseFloat",
  "JSON.stringify",
  "path.join",
  "path.resolve",
  "path.basename",
  "path.dirname",
  "path.extname",
  "fs.readFileSync",
  "fs.writeFileSync",
  "fs.existsSync",
  "RegExp",
]);
// 注意：不要把 Error 放进这个名单 —— `throw new Error("中文")` 的消息会被
// utils/ipcResult 与各处的 showToast(err.message) 直接显示给用户，
// 早期版本误排除过，导致一整类用户可见文案漏统计。

/** 对象字面量里按约定面向用户的属性名 */
const UI_PROPERTY_NAMES = new Set([
  "title",
  "label",
  "labels",
  "placeholder",
  "description",
  "hint",
  "emptyText",
  "tooltip",
  "confirmText",
  "cancelText",
  "unitLabel",
  "searchPlaceholder",
  "ariaLabel",
]);

const CJK = /[\u4e00-\u9fff\u3400-\u4dbf]/;

function isCjkText(text) {
  return CJK.test(text);
}

export function walkSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walkSourceFiles(full, out);
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** 该字符串字面量是否位于 import/export 声明里（路径不是文案） */
function isModuleSpecifier(node) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (
      ts.isImportDeclaration(parent) ||
      ts.isExportDeclaration(parent) ||
      ts.isImportTypeNode(parent) ||
      ts.isExternalModuleReference(parent)
    ) {
      return true;
    }
    current = parent;
  }
  return false;
}

/** 该节点是否位于 console.* 参数里（日志不是文案） */
function isConsoleArgument(node) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)) {
      const target = parent.expression.expression;
      if (ts.isIdentifier(target) && target.text === "console") return true;
    }
    current = parent;
  }
  return false;
}

/**
 * 从节点往上找最近的调用/构造表达式，返回被调用者名字（`a.b` 形式）。
 * 必须同时认 `new X(...)`：`new Error("中文")` 是 NewExpression 而不是 CallExpression，
 * 早期只判断 CallExpression，导致「抛给用户看的错误文案」整类漏统计。
 */
function enclosingCalleeName(node) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
      const callee = parent.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        return `${callee.expression.getText()}.${callee.name.text}`;
      }
      if (ts.isIdentifier(callee)) return callee.text;
      return "";
    }
    if (ts.isSourceFile(parent)) return null;
    current = parent;
  }
  return null;
}

/**
 * 该节点是否位于 JSX 表达式容器里：
 * 属性值 `aria-label={cond ? "收起" : "展开"}` 或子元素 `{cond ? "添加中…" : y}`。
 * 这两处都是**面向用户**的文案，早期版本只覆盖属性值，漏掉了 JSX 子元素里的三元分支。
 */
function insideJsxExpression(node) {
  let current = node;
  while (current.parent) {
    if (ts.isJsxExpression(current.parent) || ts.isJsxAttribute(current.parent)) return true;
    current = current.parent;
  }
  return false;
}

/** 收集单个文件里「应走词条表」的中文出现次数与样本 */
export function scanSource(fileName, sourceText) {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, kind);
  const samples = [];
  const strings = new Set();
  let count = 0;

  const record = (node, text) => {
    count += 1;
    strings.add(text);
    if (samples.length < 3) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      samples.push(`L${line}: ${text.replace(/\s+/g, " ").trim().slice(0, 40)}`);
    }
  };

  const visit = (node) => {
    // 1. JSX 文本
    if (ts.isJsxText(node)) {
      if (isCjkText(node.text)) record(node, node.text);
      return;
    }

    // 5. 模板字符串：整体（含插值）里的中文只算一处；去掉外层反引号便于与词条表比对
    if (ts.isTemplateExpression(node)) {
      const whole = node.getText(sourceFile).slice(1, -1);
      if (isCjkText(whole.replace(/\$\{[^}]*\}/g, ""))) record(node, whole);
      return;
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (
        isCjkText(node.text) &&
        !isModuleSpecifier(node) &&
        !isConsoleArgument(node) &&
        !isI18nIgnore(node)
      ) {
        // 2. JSX 表达式里的中文（属性值或子元素里的三元分支等）
        if (insideJsxExpression(node)) {
          record(node, node.text);
        // 4. 约定面向用户的属性
        } else if (ts.isPropertyAssignment(node.parent)) {
          const key = node.parent.name;
          const keyName = ts.isIdentifier(key) ? key.text : ts.isStringLiteral(key) ? key.text : "";
          if (UI_PROPERTY_NAMES.has(keyName)) record(node, node.text);
        } else if (ts.isParameter(node.parent) && node.parent.initializer === node) {
          // 6. 可选 props / 函数的参数默认值：一定会渲染给用户，
          //    而且因为写在函数体外求值的位置，往往被漏掉（历史上真漏过 3 处）
          record(node, node.text);
        } else if (
          ts.isBindingElement(node.parent) &&
          node.parent.initializer === node
        ) {
          // 7. **解构**参数里的默认值：`function f({ emptyText = "暂无预设" })`。
          //    Parameter 规则盖不到它（父节点是 BindingElement），
          //    但这同样会渲染给用户，历史上漏过 3 处
          record(node, node.text);
        } else if (
          ts.isReturnStatement(node.parent) &&
          node.parent.expression === node
        ) {
          // 7. 直接 return 的中文字面量（如 textLayout 的 directionLabel()）
          record(node, node.text);
        } else {
          // 3. 调用实参
          const callee = enclosingCalleeName(node);
          if (callee && !NON_UI_CALLEES.has(callee)) record(node, node.text);
        }
      }
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { count, samples, strings };
}

/** 行内豁免：`// i18n-ignore`（同一行） */
function isI18nIgnore(node) {
  return node.jsDoc?.some((doc) => /i18n-ignore/.test(doc.comment ?? "")) ?? false;
}

function main() {
  const args = process.argv.slice(2);
  const listMode = args.includes("--list");
  const fileIndex = args.indexOf("--file");
  const onlyFile = fileIndex >= 0 ? args[fileIndex + 1] : null;

  const target = onlyFile
    ? [path.resolve(SRC_DIR, "..", onlyFile)]
    : walkSourceFiles(SRC_DIR).filter((file) => !file.startsWith(I18N_DIR));
  const rows = [];

  for (const fileName of target) {
    if (!fs.existsSync(fileName)) continue;
    const sourceText = fs.readFileSync(fileName, "utf8");
    if (!isCjkText(sourceText)) continue;
    const { count, samples } = scanSource(fileName, sourceText);
    if (count > 0) {
      rows.push({ file: path.relative(SRC_DIR, fileName).replace(/\\/g, "/"), count, samples });
    }
  }

  rows.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  if (onlyFile) {
    for (const row of rows) {
      console.log(`${row.file}  ${row.count}`);
      for (const sample of row.samples) console.log(`  ${sample}`);
    }
    console.log(`共 ${total} 处`);
    return;
  }

  if (listMode) {
    for (const row of rows) {
      console.log(`${String(row.count).padStart(4)}  ${row.file}`);
      for (const sample of row.samples) console.log(`        ${sample}`);
    }
    console.log(`\n合计 ${total} 处 / ${rows.length} 个文件`);
    return;
  }

  console.log(`hardcoded UI strings: ${total}  (baseline ${BASELINE})`);

  if (total > BASELINE) {
    console.error(
      `\ni18n 逃逸：中文文案数量比基线多了 ${total - BASELINE} 处。` +
        `\n请把界面文案写进 apps/next/src/i18n/locales/zh-CN/，然后用 --list 查看剩余分布。`
    );
    for (const row of rows.slice(0, 10)) {
      console.error(`  ${String(row.count).padStart(4)}  ${row.file}`);
      for (const sample of row.samples) console.error(`        ${sample}`);
    }
    process.exit(1);
  }

  if (total < BASELINE) {
    console.log(
      `已低于基线 ${BASELINE - total} 处 —— 迁移有进展，请把 BASELINE 改成 ${total} 以锁定成果。`
    );
  } else {
    console.log("OK");
  }
}

/** 直接执行时跑 CLI；被别的脚本 import 时只导出工具函数 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
