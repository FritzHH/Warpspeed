import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export default defineConfig({
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
    nodePolyfills({
      globals: { Buffer: true, process: true, global: true },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      { find: '@tensorflow/tfjs-node', replacement: path.resolve(__dirname, 'src/empty-shim.js') },
    ],
    extensions: ['.web.js', '.web.jsx', '.js', '.jsx', '.json'],
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
      resolveExtensions: ['.web.js', '.web.jsx', '.web.ts', '.web.tsx', '.js', '.jsx', '.ts', '.tsx', '.json'],
      mainFields: ['browser', 'module', 'main'],
    },
    include: [
      'react-native-web',
      'react-native-vector-icons',
      'react-native-web-linear-gradient',
      'react-native-svg',
    ],
  },
  server: { port: 3000, open: true, https: httpsConfig },
  preview: { port: 3000, https: httpsConfig },
  build: {
    outDir: 'build',
    sourcemap: false,
    commonjsOptions: { transformMixedEsModules: true },
  },
});
