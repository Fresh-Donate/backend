export interface ServerDto {
  id: string;
  name: string;
  ip: string;
  productIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateServerDto {
  id?: string;
  name: string;
  ip?: string;
}

export interface UpdateServerDto {
  name?: string;
  ip?: string;
}
