export class PageRequest {
  limit: number;
  offset: number;

  static getLimit(limit: number, defaultLimit: number, maxLimit?: number) {
    if (limit === null || limit === undefined) return defaultLimit;
    const val = Number(limit);
    if (val < 0) return defaultLimit;
    if (maxLimit) return Math.min(val, maxLimit);
    return val;
  }

  static getOffset(limit: number) {
    if (limit === null || limit === undefined) return 0;
    const val = Number(limit);
    return Math.max(val, 0);
  }

  static computeTotal(limit: number, offset: number, size: number) {
    const noLimit = typeof limit !== "number";
    if (size === 0 && (offset || 0) === 0 && (noLimit || limit > 0)) {
      return 0;
    }
    if (size > 0 && (noLimit || limit > size)) {
      return size + (offset || 0);
    }
  }
}
