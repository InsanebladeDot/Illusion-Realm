import type { ImageAsset } from "./common";

export type RoleModel = {
  id: string;
  label: string;
};

export type CreateRole = {
  id: string;
  name: string;
  description: string;
  cover: ImageAsset;
  models: RoleModel[];
};

export type SelectedRole = {
  roleId: string;
  modelId: string;
};
