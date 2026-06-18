import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import { configureMonacoYaml } from 'monaco-yaml'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import yamlWorker from 'monaco-yaml/yaml.worker?worker'
import schema from './schema/schema.json'

// Bundle Monaco and its web workers locally so the editor works fully offline
// (no CDN). The YAML worker powers monaco-yaml's validation/autocomplete.
window.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'yaml') return new yamlWorker()
    return new editorWorker()
  },
}

// Tell @monaco-editor/react to use our bundled instance instead of the CDN.
loader.config({ monaco })

let configured = false

/** Configure monaco-yaml once with our schema for inline validation/autocomplete. */
export function setupMonacoYaml(): void {
  if (configured) return
  configured = true
  configureMonacoYaml(monaco, {
    enableSchemaRequest: false,
    hover: true,
    completion: true,
    validate: true,
    schemas: [
      {
        uri: 'inmemory://designer/schema.json',
        fileMatch: ['*'],
        schema: schema as object,
      },
    ],
  })
}
