// Tiny static server for a build folder, with Vercel's cleanUrls (/a/b -> /a/b.html), no caching.
// Lets a second build be checked while `astro preview` keeps serving dist. Usage: node dev/serve.mjs <dir> <port>
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
const [dir = 'dist', port = '4411'] = process.argv.slice(2);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.xml': 'application/xml', '.ico': 'image/x-icon' };
const isFile = (p) => stat(p).then((s) => s.isFile(), () => false);
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (path.startsWith('..')) { res.writeHead(400).end(); return; }
  let f = join(dir, path);
  for (const c of [f, `${f}.html`, join(f, 'index.html')]) if (await isFile(c)) { f = c; break; }
  if (!(await isFile(f))) { res.writeHead(404, { 'content-type': types['.html'] }); res.end(await readFile(join(dir, '404.html')).catch(() => 'not found')); return; }
  res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(await readFile(f));
}).listen(Number(port), '127.0.0.1', () => console.log(`serving ${dir} on http://127.0.0.1:${port}`));
