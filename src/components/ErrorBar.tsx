import type { ParseError } from '../schema/types'

interface ErrorBarProps {
  errors: ParseError[]
}

export function ErrorBar({ errors }: ErrorBarProps) {
  if (errors.length === 0) return null
  return (
    <div className="error-bar">
      <span className="error-bar__count">
        {errors.length} issue{errors.length > 1 ? 's' : ''}
      </span>
      <ul className="error-bar__list">
        {errors.map((e, i) => (
          <li key={i}>
            <code>{e.path}</code> — {e.message}
          </li>
        ))}
      </ul>
    </div>
  )
}
