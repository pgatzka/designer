import MonacoEditor, { type OnMount } from '@monaco-editor/react'
import { useCallback } from 'react'
import { setupMonacoYaml } from '../monacoSetup'

interface EditorProps {
  value: string
  onChange: (value: string) => void
}

export function Editor({ value, onChange }: EditorProps) {
  const handleMount = useCallback<OnMount>(() => {
    setupMonacoYaml()
  }, [])

  return (
    <MonacoEditor
      language="yaml"
      theme="vs-dark"
      value={value}
      onMount={handleMount}
      onChange={(v) => onChange(v ?? '')}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        tabSize: 2,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        wordWrap: 'off',
        renderWhitespace: 'none',
      }}
    />
  )
}
