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

/** English catalogue：与 `zh-CN/index.ts` 同构（names排 序一致，键完全一致由类型强制） */
export const en = {
  agent,
  cartoon,
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
