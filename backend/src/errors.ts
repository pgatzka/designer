/**
 * Produce a human-readable message from any thrown value. Crucially this unwraps
 * `AggregateError` (whose own `.message` is often empty — e.g. a failed pg
 * connection that tried both IPv6 and IPv4) and appends an error `code`
 * (`ECONNREFUSED`, pg `28P01`, …) when present, so callers never surface a blank
 * "failed" message.
 */
export function describeError(err: unknown): string {
  if (err instanceof AggregateError) {
    const parts = (err.errors ?? []).map(describeError).filter(Boolean)
    if (err.message) return err.message
    return parts.length ? parts.join('; ') : 'multiple errors'
  }
  if (err instanceof Error) {
    const code = (err as { code?: string | number }).code
    const base = err.message || err.name
    return code != null && String(code) !== '' ? `${base} (${code})` : base
  }
  if (err == null) return 'unknown error'
  return String(err)
}
