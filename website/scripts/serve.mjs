// Minimal static server for previewing dist/ locally: `node scripts/serve.mjs [port]`.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL(`../${process.env.DIST || 'dist'}/`, import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
};

async function resolve(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(dist, clean);
  if (!file.startsWith(dist)) return null;
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    await stat(file);
    return file;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  // Match static hosts: /services -> /services/
  if (!extname(req.url.split('?')[0]) && !req.url.split('?')[0].endsWith('/') && (await resolve(req.url + '/'))) {
    res.writeHead(301, { Location: req.url.split('?')[0] + '/' }).end();
    return;
  }
  const file = await resolve(req.url);
  if (!file) {
    res.writeHead(404, { 'Content-Type': types['.html'] }).end(await readFile(join(dist, '404.html')));
    return;
  }
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(await readFile(file));
}).listen(port, () => console.log(`Serving dist/ at http://localhost:${port}`));
