import { defineConfig } from 'vitest/config';

// Testes de lógica pura (sem DOM nem TestBed): src/**/*.spec.ts, em Node. `npm test` roda uma vez; `npx vitest` fica observando.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
