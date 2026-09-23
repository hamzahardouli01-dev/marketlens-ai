import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import fs from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');

async function main() {
  console.log('⚡ Step 1: Generating icons...');
  execSync('node scripts/generate-icons.mjs', { cwd: rootDir, stdio: 'inherit' });

  console.log('⚡ Step 2: TypeScript check...');
  execSync('npx tsc -b', { cwd: rootDir, stdio: 'inherit' });

  console.log('⚡ Step 3: Building Popup and Options UI...');
  await build({
    configFile: false,
    plugins: [react()],
    root: rootDir,
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(rootDir, 'popup.html'),
          options: resolve(rootDir, 'options.html'),
        },
      },
    },
  });

  console.log('⚡ Step 4: Building Content Script (Standalone IIFE - No ES imports)...');
  await build({
    configFile: false,
    root: rootDir,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: resolve(rootDir, 'src/content/content.ts'),
        name: 'MarketLensContent',
        formats: ['iife'],
        fileName: () => 'content.js',
      },
    },
  });

  console.log('⚡ Step 5: Building Background Service Worker (Standalone)...');
  await build({
    configFile: false,
    root: rootDir,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: resolve(rootDir, 'src/background/service-worker.ts'),
        name: 'MarketLensBackground',
        formats: ['iife'],
        fileName: () => 'background.js',
      },
    },
  });

  // Ensure public icons & manifest are in dist
  console.log('⚡ Step 6: Verifying manifest.json and icons in dist...');
  fs.copyFileSync(resolve(rootDir, 'public/manifest.json'), resolve(rootDir, 'dist/manifest.json'));
  if (!fs.existsSync(resolve(rootDir, 'dist/icons'))) {
    fs.mkdirSync(resolve(rootDir, 'dist/icons'), { recursive: true });
  }
  const icons = fs.readdirSync(resolve(rootDir, 'public/icons'));
  for (const icon of icons) {
    fs.copyFileSync(resolve(rootDir, 'public/icons', icon), resolve(rootDir, 'dist/icons', icon));
  }

  console.log('✅ Build complete: All scripts are self-contained standalone IIFE with ZERO illegal ES imports!');
}

main().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
