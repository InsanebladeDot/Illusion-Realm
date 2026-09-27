/**
 * 「文件夹行上的 N 张」= 「点开这个文件夹看到的张数」的机械门禁（纯 Node，进 `pnpm check`）。
 *
 * 为什么需要它：这个数字是**用户看得见、且可以直接被证伪**的 —— 行上写「5 张」、
 * 点进去只有 3 张，用户第一反应是这个软件在骗人。而它恰恰有两个容易走偏的地方：
 *   ① 判据（哪些后缀算图片）在两处各写了一份，改了其中一处不会有人发现；
 *   ② 「直接包含」与「递归含子文件夹」只差一次递归调用，写错了没有任何报错，
 *      症状只是数字偏大（父文件夹把子文件夹的图也算了进去）。
 * 因此这里断言的是**两个函数之间的一致性**，而不是一个写死的期望值。
 *
 * 断言：
 *   A. `listOutputFolders()` 每条的 `imageCount` 等于 `listGeneratedImages(output, dir)` 的长度
 *      （对顶层、嵌套层、空目录各测一次）；
 *   B. 非图片后缀（.txt）不计入，图片后缀（.png/.jpg/.webp）计入；
 *   C. 负向对照：父文件夹**不**把子文件夹的图算进自己（A 下挂 A/子，计数必须不同）。
 *
 * 用**桩替换 appPaths** 的方式在纯 Node 下加载主进程模块（不启 Electron，见
 * `verify-output-path-contract.js` 的同一手法）。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const APP_PATHS_MODULE = path.join(REPO_ROOT, "apps", "electron", "appPaths.js");
const GENERATED_IMAGES_MODULE = path.join(REPO_ROOT, "apps", "electron", "generatedImages.js");

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

/** 用桩替换 appPaths，避免在纯 Node 下拉起 Electron 依赖 */
function loadGeneratedImages() {
  require.cache[APP_PATHS_MODULE] = {
    id: APP_PATHS_MODULE,
    filename: APP_PATHS_MODULE,
    loaded: true,
    exports: { getAppRootDir: () => path.join(os.tmpdir(), "folder-count-fake-root") },
  };
  return require(GENERATED_IMAGES_MODULE);
}

/**
 * 造一棵固定形状的输出目录树：
 *   根（2 张图 + 1 个 .txt）/ A（3 张图）/ A/子（2 张图 + 1 个 .txt）/ B（空）
 */
function buildFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "folder-count-"));
  const write = (relative) => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "not-a-real-image");
  };
  write("1.png");
  write("2.jpg");
  write("notes.txt");
  write("A/3.png");
  write("A/4.png");
  write("A/5.webp");
  write("A/子/6.png");
  write("A/子/7.png");
  write("A/子/8.txt");
  fs.mkdirSync(path.join(root, "B"), { recursive: true });
  return root;
}

/**
 * 递归数一遍某个目录下的图片 —— **由测试自己数**（不经过被测实现），
 * 用来证明上一条断言不是在恒真地自说自话：直接计数 3、递归计数 5，两者必须不同。
 */
function countImagesRecursively(dirPath) {
  let count = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const target = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      count += countImagesRecursively(target);
    } else if ([".png", ".jpg", ".webp"].includes(path.extname(entry.name))) {
      count += 1;
    }
  }
  return count;
}

function main() {
  const { listOutputFolders, listGeneratedImages } = loadGeneratedImages();
  const root = buildFixture();

  const folders = listOutputFolders(root);
  const byName = new Map(folders.map((folder) => [folder.name, folder]));
  const rowCount = (name) => byName.get(name)?.imageCount;
  /** 用户真的点开这个文件夹时会看到的张数 */
  const openedCount = (relative) => listGeneratedImages(root, path.join(root, relative)).length;

  check(
    "顶层文件夹：行上的张数 = 点开看到的张数",
    rowCount("A") === openedCount("A"),
    `行=${rowCount("A")} 点开=${openedCount("A")}`
  );
  check(
    "嵌套文件夹：行上的张数 = 点开看到的张数",
    rowCount("子") === openedCount(path.join("A", "子")),
    `行=${rowCount("子")} 点开=${openedCount(path.join("A", "子"))}`
  );
  check("空文件夹为 0（不是 undefined / 不报错）", rowCount("B") === 0, `行=${rowCount("B")}`);
  check(
    "非图片后缀不计入（根目录两个 .txt 不算）",
    rowCount("子") === 2 && listGeneratedImages(root, null).length === 7,
    `子=${rowCount("子")} 全部递归=${listGeneratedImages(root, null).length}`
  );
  /**
   * 负向对照：A 直接 3 张、其子树里共 5 张。若实现改成递归计数，上面第一条会读到 5 ≠ 点开看到的 3
   * —— 前提是这两个数**确实不同**（这里由测试自己递归数出来验一遍），否则那条断言没有区分度。
   */
  const directCountUnderA = 3;
  const recursiveCountUnderA = countImagesRecursively(path.join(root, "A"));
  check(
    "负向对照：行上是「直接计数」而不是「递归计数」",
    recursiveCountUnderA !== directCountUnderA && rowCount("A") === directCountUnderA,
    `行=${rowCount("A")} 直接=${directCountUnderA} 递归=${recursiveCountUnderA}`
  );

  fs.rmSync(root, { recursive: true, force: true });

  const failed = checks.filter((item) => !item.ok).length;
  console.log(
    failed === 0
      ? `FOLDER IMAGE COUNT OK ✓  ${checks.length}/${checks.length}`
      : `FOLDER IMAGE COUNT FAILED ✗  ${checks.length - failed}/${checks.length}`
  );
  process.exit(failed === 0 ? 0 : 1);
}

main();
