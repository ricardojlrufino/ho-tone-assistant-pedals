import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['plugins/*/src/**/*.test.ts', 'templates/*/src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
