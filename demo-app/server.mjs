// A tiny static web server for the demo claims form. No framework, no build step.
//
//   node demo-app/server.mjs            -> http://localhost:4173/v1/  /v2/  /v2-bug/
//
// Each folder (v1, v2, v2-bug) is a complete copy of the page, so you can diff them
// to see exactly what changed between "releases".
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

createServer(async (request, response) => {
  // "/v2/" -> "v2/index.html". normalize() + the startsWith check stop "../" escaping the folder.
  let path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname));
  if (path.endsWith('/')) path += 'index.html';
  const file = join(root, path);
  if (!file.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'text/plain' }).end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Demo app on http://localhost:${port}/v1/ /v2/ /v2-bug/`));
