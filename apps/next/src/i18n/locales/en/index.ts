// 无限画布只登记独立文案，不改变创建页的参数与生成状态。
import { canvas } from "./canvas";
// 漫画对话框仅增加自己的词条，不恢复已删除的旧素材设置页文案。
// 双语入口登记同一命名空间，模板名称随现有语言状态更新。
import { dialogue } from "./dialogue";
import { agent } from "./agent";
import { auth } from "./auth";
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

/** English catalogue：与 `zh-CN/index.ts` 同构（names排 序一致，键完全一致由类型强制） */
export const en = {
  canvas,
  dialogue,
  agent,
  auth,
  characters,
  common,
  components,
  create,
  errors,
  home,
  inspect,
  nav,
  profile,
  promptAssembly,
  settings,
  taxonomy,
  toolBox,
  updates,
  view3d,
} as const;
