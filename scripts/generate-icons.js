import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const svgPath = path.resolve('public/icon.svg');
const svgBuffer = fs.readFileSync(svgPath);

async function generate() {
  console.log('Generating PWA icons from SVG...');

  // 1. 192x192
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.resolve('public/pwa-192x192.png'));
  console.log('Generated pwa-192x192.png');

  // 2. 512x512 standard
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve('public/pwa-512x512.png'));
  console.log('Generated pwa-512x512.png');

  // 3. Apple Touch Icon 180x180
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.resolve('public/apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // 4. Favicon 64x64 PNG and 32x32
  await sharp(svgBuffer)
    .resize(64, 64)
    .png()
    .toFile(path.resolve('public/favicon.png'));
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.resolve('public/favicon.ico'));
  console.log('Generated favicons');

  // 5. Maskable Icon (512x512 with 15% safe padding around central content)
  // Maskable icon requires solid/gradient background spanning full bleed, with content inside central 80% circle
  const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
      <linearGradient id="bgGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#059669" />
        <stop offset="50%" stop-color="#047857" />
        <stop offset="100%" stop-color="#064e3b" />
      </linearGradient>
      <linearGradient id="ballGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff" />
        <stop offset="100%" stop-color="#e2e8f0" />
      </linearGradient>
      <linearGradient id="goldGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fbbf24" />
        <stop offset="100%" stop-color="#d97706" />
      </linearGradient>
    </defs>
    <!-- Full-bleed background without border radius for maskable -->
    <rect width="512" height="512" fill="url(#bgGrad2)" />
    <!-- Safe zone inner content (centered, safely padded within central 80%) -->
    <g transform="translate(51, 51) scale(0.8)">
      <circle cx="256" cy="240" r="146" fill="none" stroke="url(#goldGrad2)" stroke-width="12" opacity="0.85" />
      <circle cx="256" cy="240" r="132" fill="url(#ballGrad2)" />
      <circle cx="256" cy="240" r="88" fill="#047857" />
      <text x="256" y="268" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="90" font-weight="900" fill="#ffffff" text-anchor="middle">B</text>
      <polygon points="256,76 262,94 280,94 266,104 271,122 256,112 241,122 246,104 232,94 250,94" fill="#fbbf24" />
      <text x="256" y="420" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="32" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="4">BINGO 75</text>
    </g>
  </svg>`;

  await sharp(Buffer.from(maskableSvg))
    .resize(512, 512)
    .png()
    .toFile(path.resolve('public/pwa-maskable-512x512.png'));
  console.log('Generated pwa-maskable-512x512.png');
}

generate().catch(console.error);
