import { cp, readFile, writeFile } from 'node:fs/promises';

const path = new URL('../dist/index.html', import.meta.url);
let html = await readFile(path, 'utf8');
html = html.replace('<html lang="en">', '<html lang="es">');
html = html.replace('</head>', [
  '  <link rel="manifest" href="./manifest.json">',
  '  <link rel="apple-touch-icon" href="./icons/icon-192.png">',
  '  <meta name="apple-mobile-web-app-capable" content="yes">',
  '  <meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '  <meta name="apple-mobile-web-app-title" content="Menú en pareja">',
  '  <meta name="application-name" content="Menú en pareja">',
  '</head>',
].join('\n'));
let basePath = process.env.PAGES_BASE_PATH ?? '';
while (basePath.endsWith('/')) basePath = basePath.slice(0, -1);
if (basePath) {
  html = html.replaceAll('href="/favicon.ico"', `href="${basePath}/favicon.ico"`);
  html = html.replaceAll('src="/_expo/', `src="${basePath}/_expo/`);
}
await writeFile(path, html);
await cp(new URL('../public/manifest.json', import.meta.url), new URL('../dist/manifest.json', import.meta.url));
await cp(new URL('../public/icons', import.meta.url), new URL('../dist/icons', import.meta.url), { recursive: true });
await writeFile(new URL('../dist/.nojekyll', import.meta.url), '');
console.log(`PWA metadata and icons copied to dist${basePath ? ` (base ${basePath})` : ''}`);
