import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default defineConfig((configEnv) =>
  mergeConfig(
    viteConfig(configEnv),
    defineConfig({
      test: {
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
        coverage: {
          provider: 'v8',
          reporter: ['text', 'html', 'lcov', 'json-summary'],
          include: ['src/**/*.{ts,vue}', 'config/**/*.ts'],
          exclude: ['src/**/__tests__/**', 'src/**/*.d.ts', 'src/main.ts', 'src/router/index.ts'],
          thresholds: { perFile: true, lines: 80, branches: 80, functions: 80, statements: 80 },
        },
        exclude: [...configDefaults.exclude, 'e2e/**'],
        root: fileURLToPath(new URL('./', import.meta.url)),
      },
    }),
  ),
)
