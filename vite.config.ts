/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/schema/**', 'src/graph/**'],
      exclude: ['**/types.ts', '**/*.test.ts', '**/*.json'],
      thresholds: { lines: 95, statements: 95, functions: 100, branches: 90 },
    },
  },
})
