import type { MessageKey } from "@/i18n";

/** 作品筛选项的形状 */
export type CharacterCopyrightFilter = { slug: string; label: string };

/**
 * 筛选项在渲染进程侧的形状：`label` 存的是**词条 key**（如 `"taxonomy.characterFilters.copyright.all"`），
 * 渲染时用 `t(item.label)` 取文案 —— 与 `LocalizedNavItem` 同一套做法。
 */
export type LocalizedCharacterCopyrightFilter = Omit<CharacterCopyrightFilter, "label"> & {
  label: MessageKey;
};

/**
 * 角色库筛选配置（静态数据）
 * 作品的候选列表是手工挑选的常见热门作品 slug（API 只提供 copyright 过滤，
 * 没有独立的分类接口），点击后按此 slug 过滤。
 */
export const CHARACTER_COPYRIGHT_FILTERS: LocalizedCharacterCopyrightFilter[] = [
  { slug: "", label: "taxonomy.characterFilters.copyright.all" },
  { slug: "vocaloid", label: "taxonomy.characterFilters.copyright.vocaloid" },
  { slug: "touhou", label: "taxonomy.characterFilters.copyright.touhou" },
  { slug: "genshin_impact", label: "taxonomy.characterFilters.copyright.genshinImpact" },
  { slug: "honkai:_star_rail", label: "taxonomy.characterFilters.copyright.honkaiStarRail" },
  { slug: "blue_archive", label: "taxonomy.characterFilters.copyright.blueArchive" },
  { slug: "hololive", label: "taxonomy.characterFilters.copyright.hololive" },
  { slug: "azur_lane", label: "taxonomy.characterFilters.copyright.azurLane" },
  { slug: "fate/grand_order", label: "taxonomy.characterFilters.copyright.fateGrandOrder" },
  { slug: "nikke", label: "taxonomy.characterFilters.copyright.nikke" },
  { slug: "arknights", label: "taxonomy.characterFilters.copyright.arknights" },
  { slug: "project_sekai", label: "taxonomy.characterFilters.copyright.projectSekai" },
  { slug: "girls'_frontline", label: "taxonomy.characterFilters.copyright.girlsFrontline" },
  { slug: "idolmaster", label: "taxonomy.characterFilters.copyright.idolmaster" },
  { slug: "kantai_collection", label: "taxonomy.characterFilters.copyright.kantaiCollection" },
];

/** 网格每页数量（4 列 × 6 行） */
export const CHARACTER_PAGE_SIZE = 24;
