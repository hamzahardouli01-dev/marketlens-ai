#!/usr/bin/env node
/**
 * Generate PNG icons for the Chrome extension from the source JPEG.
 * Uses the Canvas API via canvas npm package if available,
 * otherwise creates simple colored PNG files using raw PNG encoding.
 *
 * Run: node scripts/generate-icons.mjs
 */

import { createCanvas } from 'canvas';
import { createWriteStream, mkdirSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZES = [16, 32, 48, 128];
const OUT_DIR = resolve(__dirname, '../public/icons');

mkdirSync(OUT_DIR, { recursive: true });

async function generateIcons() {
  // Try to load the generated icon image
  let sourceImage = null;
  try {
    const { createCanvas: cc, loadImage } = await import('canvas');
    const iconPath = resolve(__dirname, '../icon_source.jpg');
    
    if (existsSync(iconPath)) {
      sourceImage = await loadImage(iconPath);
    }
  } catch {
    console.log('canvas module not available — generating placeholder icons');
  }

  for (const size of SIZES) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    if (sourceImage) {
      ctx.drawImage(sourceImage, 0, 0, size, size);
    } else {
      // Fallback: gradient + text icon
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, '#6C63FF');
      grad.addColorStop(1, '#A55CFF');
      
      // Rounded rect background
      const r = size * 0.2;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(size - r, 0);
      ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r);
      ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size);
      ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.fill();

      // Draw a simple car + magnifying glass symbol
      ctx.fillStyle = 'white';
      ctx.font = `${Math.floor(size * 0.55)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔍', size / 2, size / 2);
    }

    const out = resolve(OUT_DIR, `icon${size}.png`);
    const stream = canvas.createPNGStream();
    const fileStream = createWriteStream(out);
    stream.pipe(fileStream);
    await new Promise((res) => fileStream.on('finish', res));
    console.log(`✓ Generated icon${size}.png`);
  }

  console.log('\n✓ All icons generated in public/icons/');
}

generateIcons().catch(console.error);
