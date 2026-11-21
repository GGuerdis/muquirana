import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
    // os testes de milhares de casos (sempre os mesmos) podem passar de 5 s numa máquina ocupada (ex.: o CI)
    testTimeout: 30000,
  },
})
