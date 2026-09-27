import { agent } from "./agent";
import { cartoon } from "./cartoon";
import { characters } from "./characters";
import { common } from "./common";
import { components } from "./components";
import { create } from "./create";
import { errors } from "./errors";
import { home } from "./home";
import { inspect } from "./inspect";
import { nav } from "./nav";
import { profile } from "./profile";
import { promptAssembly } from "./promptAssembly";
import { settings } from "./settings";
import { taxonomy } from "./taxonomy";
import { toolBox } from "./toolBox";
import { updates } from "./updates";
import { view3d } from "./view3d";

/**
 * 简体中文词条表 —— **参考语言**。
 *
 * 新增词条时先加在这里；`MessageKey` 由本文件的形状推导，
 * 因此这里写下的每个叶子都会立刻成为可用的强类型 key。
 * 一批界面文案迁移完就把同名字段补进来，命名空间按功能域切分：
 * 页面域 `create` / `view3d` / `characters` / `promptAssembly` / `cartoon` /
 * `toolBox` / `home` / `inspect` / `settings` / `profile` / `updates`，
 * 横向域 `common` / `nav` / `components` / `errors` / `taxonomy`。
 */
export const zhCN = {
  agent,
  common,
  nav,
  create,
  view3d,
  characters,
  promptAssembly,
  cartoon,
  toolBox,
  home,
  inspect,
  settings,
  profile,
  updates,
  components,
  errors,
  taxonomy,
} as const;
