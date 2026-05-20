import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function migrationDataPlugin() {
  const dataDir = path.resolve(__dirname, '_migration_data');
  const prefixes = ['/lightspeed/', '/import_data/'];
  const handler = (req, res, next) => {
    const url = req.url || '';
    const prefix = prefixes.find((p) => url.startsWith(p));
    if (!prefix) return next();
    const rel = url.slice(1).split('?')[0];
    const filePath = path.join(dataDir, rel);
    if (!filePath.startsWith(dataDir)) return next();
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) return next();
      res.setHeader('Content-Type', 'text/csv');
      fs.createReadStream(filePath).pipe(res);
    });
  };
  return {
    name: 'migration-data-serve',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

const httpsConfig = (() => {
  if (!process.env.HTTPS && !process.argv.includes('--https')) return undefined;
  try {
    return {
      cert: fs.readFileSync('./cert.pem'),
      key: fs.readFileSync('./key.pem'),
    };
  } catch {
    return undefined;
  }
})();

export default defineConfig(async () => {
  // rollup-plugin-visualizer is ESM-only; load via dynamic import so the
  // Vite CJS config loader can consume it.
  const { visualizer } = await import('rollup-plugin-visualizer');
  return {
  plugins: [
    react({
      babel: {
        plugins: [
          ['@babel/plugin-proposal-class-properties', { loose: true }],
          '@babel/plugin-transform-flow-strip-types',
        ],
      },
    }),
    viteCommonjs(),
    migrationDataPlugin(),
    nodePolyfills({
      globals: { Buffer: true, process: true, global: true },
      protocolImports: true,
    }),
    visualizer({
      filename: 'build/stats.html',
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    }),
    visualizer({
      filename: 'build/stats.json',
      gzipSize: true,
      brotliSize: true,
      template: 'raw-data',
    }),
  ],
  resolve: {
    alias: [
      { find: '@tensorflow/tfjs-node', replacement: path.resolve(__dirname, 'src/empty-shim.js') },
    ],
    extensions: ['.js', '.jsx', '.json'],
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
    global: 'globalThis',
  },
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
      resolveExtensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      mainFields: ['browser', 'module', 'main'],
    },
  },
  server: { port: 3000, open: true, https: httpsConfig },
  preview: { port: 3000, https: httpsConfig },
  build: {
    outDir: 'build',
    sourcemap: false,
    commonjsOptions: { transformMixedEsModules: true },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('firebase')) return 'firebase';
          if (id.includes('@stripe')) return 'stripe';
          if (id.includes('xlsx')) return 'xlsx';
          if (id.includes('react-quill') || id.includes(path.sep + 'quill')) return 'quill';
          if (id.includes('react-day-picker') || id.includes('date-fns')) return 'day-picker';
          if (id.includes('@radix-ui')) return 'radix';
          if (id.includes('lodash')) return 'lodash';
          if (id.includes('dayjs')) return 'dayjs';
          if (id.includes('dompurify')) return 'dompurify';
        },
      },
    },
  },
  };
});
