/**
 * Tiny console logger so client-side flows emit readable, greppable logs.
 * Prefixed with `[designer]` and the level; objects are passed through so the
 * browser console keeps them inspectable.
 */
type Fields = Record<string, unknown>

function emit(fn: (...args: unknown[]) => void, level: string, msg: string, fields?: Fields): void {
  if (fields) fn(`[designer] ${level}: ${msg}`, fields)
  else fn(`[designer] ${level}: ${msg}`)
}

export const log = {
  info: (msg: string, fields?: Fields) => emit(console.info, 'info', msg, fields),
  warn: (msg: string, fields?: Fields) => emit(console.warn, 'warn', msg, fields),
  error: (msg: string, fields?: Fields) => emit(console.error, 'error', msg, fields),
}
