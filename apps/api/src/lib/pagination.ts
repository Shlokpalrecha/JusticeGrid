import type { ResponseMeta } from "@justicegrid/shared";

export interface PageParams {
  page: number;
  pageSize: number;
}

export function toSkipTake(params: PageParams): { skip: number; take: number } {
  return { skip: (params.page - 1) * params.pageSize, take: params.pageSize };
}

export function buildPageMeta(requestId: string, params: PageParams, total: number): ResponseMeta {
  return {
    requestId,
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}
