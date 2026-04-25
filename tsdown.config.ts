import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
  },
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: ['commander', 'zod'],
  },
});
