// Local static server for dist/ that behaves like GitHub Pages: unknown paths get 404.html,
// so reloading a route such as /compra boots the app.
// Usage: node scripts/serve-dist.mjs [port] [base path, e.g. /app]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.argv[2] ?? 8913);
const base = (process.argv[3] ?? '').replace(/\/+$/, '');
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  // URL parsing resolves "." and ".." segments, so the path cannot leave dist/.
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  try {
    if (!path.startsWith(`${base}/`)) throw new Error('outside base path');
    const relative = path.slice(base.length);
    const file = join(root, relative.endsWith('/') ? `${relative}index.html` : relative);
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(await readFile(join(root, '404.html')));
  }
}).listen(port, '127.0.0.1', () => console.log(`dist/ en http://127.0.0.1:${port}${base}/`));
