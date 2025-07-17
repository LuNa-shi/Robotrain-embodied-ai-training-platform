import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: './index.html'
    }
  },
  optimizeDeps: {
    include: [
      // 强制 Vite 预构建 fast-deep-equal，以解决模块导入错误
      'fast-deep-equal',
    ],
    exclude: ['parquet-wasm', 'apache-arrow'],
  },
  server: {
    host: true,
    port: 5173,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: 'http://backend:8000',  // 直接使用Docker服务名
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/**/*.{js,jsx,ts,tsx}',
        '!src/test/**',
        '!src/**/*.test.{js,jsx,ts,tsx}',
        '!src/**/*.config.{js,ts}',
        '!src/**/*.d.ts'
      ],
      exclude: [
        'node_modules/',
        'coverage/',
        'dist/',
        // 排除未使用的页面
        'src/pages/DataManagement/**',
        'src/pages/ProjectManagement/**',
        'src/pages/Settings/**',
        // 排除不需要统计覆盖率的文件
        'src/store/**',
        'src/pages/NotFound/**',
        'src/pages/Help/**',
        // 新增：排除指定组件和工具
        'src/components/AuthProvider.jsx',
        'src/components/RobotSimulation.jsx',
        'src/config/routes.*',
        'src/utils/motionDataLoader.js',
        'src/utils/debug.js',
        'src/utils/parquetLoader.js',
        'src/utils/api.js',
        'src/utils/auth.js',
        'src/App.jsx',
        'src/main.jsx'
      ],
    },
  },
});