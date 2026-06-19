import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  title: string
  onCancel: () => void
  onSubmit?: () => void
  submitLabel?: string
  submitDisabled?: boolean
  children: ReactNode
}

/** Small modal dialog wrapped in a form (Enter submits, Esc / overlay cancels). */
export function Modal({
  title,
  onCancel,
  onSubmit,
  submitLabel = 'Save',
  submitDisabled,
  children,
}: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit?.()
        }}
      >
        <h2 className="modal__title">{title}</h2>
        <div className="modal__body">{children}</div>
        <div className="modal__footer">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitDisabled}>
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
