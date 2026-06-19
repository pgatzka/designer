import { createContext } from 'react'

export interface CanvasActions {
  openColumnMenu: (schema: string, table: string, column: string, x: number, y: number) => void
}

export const CanvasActionsContext = createContext<CanvasActions | null>(null)
