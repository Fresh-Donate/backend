export interface ProductGroupDto {
  id: string;
  name: string;
  upgradeMode: boolean;
}

export interface GroupDto {
  id: string;
  name: string;
  upgradeMode: boolean;
  productIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateGroupDto {
  name: string;
  upgradeMode?: boolean;
  productIds: string[];
}

export interface UpdateGroupDto {
  name?: string;
  upgradeMode?: boolean;
  productIds?: string[];
}
