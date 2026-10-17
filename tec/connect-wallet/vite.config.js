import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { testOrdersPlugin } from './server/testOrders.js';
export default defineConfig({ base: './', plugins: [react(), testOrdersPlugin()], server: { host: '127.0.0.1', port: 5173 } });
