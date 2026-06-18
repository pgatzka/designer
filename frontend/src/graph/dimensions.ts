/** Shared sizing constants so estimated node sizes (for ELK) match the rendered DOM. */
export const NODE_WIDTH = 240
export const HEADER_HEIGHT = 34
export const ROW_HEIGHT = 26

export function tableHeight(columnCount: number): number {
  return HEADER_HEIGHT + Math.max(columnCount, 1) * ROW_HEIGHT
}
