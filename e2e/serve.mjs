// Serves the exported site (the `out` folder) the way GitHub Pages does: plain files under a
// sub-path. Used by `npm run preview` and by the browser test.
//   node e2e/serve.mjs [base-path] [port]      e.g. node e2e/serve.mjs /laundry-slice 4173
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const base = (process.argv[2] ?? process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '');
const port = Number(process.argv[3] ?? 4173);
const root = path.resolve('out');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.txt': 'text/plain', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' };

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  let file = decodeURIComponent(url.pathname);
  if (base && !file.startsWith(`${base}/`) && file !== base) file = '/404.html';
  else file = file.slice(base.length) || '/';
  let target = path.join(root, file);
  if (!target.startsWith(root)) target = path.join(root, '404.html');
  try {
    if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': TYPES['.html'] });
    response.end(await readFile(path.join(root, '404.html')).catch(() => 'Not found'));
  }
}).listen(port, () => console.log(`Serving out/ at http://localhost:${port}${base}/`));
