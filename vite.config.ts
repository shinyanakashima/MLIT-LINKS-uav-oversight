import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// GitHub Pages（プロジェクトページ）配信のため base にリポジトリ名を設定。
export default defineConfig({
  base: '/MLIT-LINKS-uav-oversight/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
