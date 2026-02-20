import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/__tests__/setupTests.ts'],
        exclude: ['e2e/**', 'node_modules/**', '.next/**'],
        alias: {
            '@': path.resolve(__dirname, './src')
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts', 'src/**/*.tsx'],
            exclude: ['src/db/schema.ts'] // Don't need coverage for schema defs
        }
    }
})
