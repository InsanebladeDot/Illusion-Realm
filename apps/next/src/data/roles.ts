import animaOfficial from "@/assets/icon/create/models/anima-official-base.webp";
import animaPreview2 from "@/assets/icon/create/models/anima-preview2.webp";
import arthemyComics from "@/assets/icon/create/models/arthemy-comics.webp";
import cyberrealistic from "@/assets/icon/create/models/cyberrealistic-pony.webp";
import hassaku from "@/assets/icon/create/models/hassaku-xl.webp";
import hyphoria from "@/assets/icon/create/models/hyphoria.webp";
import type { CreateRole, SelectedRole } from "@/types/role";

export const CREATE_ROLES: CreateRole[] = [
  {
    id: "miku",
    name: "初音未来",
    description: "清新高音女声",
    cover: animaPreview2,
    models: [
      { id: "miku-v1", label: "标准版" },
      { id: "miku-v2", label: "情感增强" },
    ],
  },
  {
    id: "asuka",
    name: "明日香",
    description: "明亮系少女音",
    cover: hassaku,
    models: [
      { id: "asuka-v1", label: "默认" },
      { id: "asuka-soft", label: "柔和版" },
    ],
  },
  {
    id: "rem",
    name: "雷姆",
    description: "温柔治愈系",
    cover: hyphoria,
    models: [{ id: "rem-v1", label: "默认" }],
  },
  {
    id: "kaito",
    name: "KAITO",
    description: "偏低男声",
    cover: arthemyComics,
    models: [
      { id: "kaito-v1", label: "标准版" },
      { id: "kaito-deep", label: "低沉版" },
    ],
  },
  {
    id: "luka",
    name: "巡音ルカ",
    description: "成熟女声",
    cover: cyberrealistic,
    models: [{ id: "luka-v1", label: "默认" }],
  },
  {
    id: "rin",
    name: "镜音铃",
    description: "活泼少女音",
    cover: animaOfficial,
    models: [
      { id: "rin-v1", label: "标准版" },
      { id: "rin-power", label: "力量版" },
    ],
  },
];

export const DEFAULT_SELECTED_ROLE: SelectedRole = {
  roleId: "miku",
  modelId: "miku-v1",
};

export function getRoleById(id: string): CreateRole | undefined {
  return CREATE_ROLES.find((role) => role.id === id);
}

export function getRoleModelLabel(roleId: string, modelId: string): string {
  const role = getRoleById(roleId);
  return role?.models.find((model) => model.id === modelId)?.label ?? modelId;
}

export function getSelectedRoleDisplay(selected: SelectedRole) {
  const role = getRoleById(selected.roleId);
  const modelLabel = getRoleModelLabel(selected.roleId, selected.modelId);

  return {
    roleName: role?.name ?? selected.roleId,
    modelLabel,
    cover: role?.cover ?? animaOfficial,
    description: role?.description ?? "",
  };
}
