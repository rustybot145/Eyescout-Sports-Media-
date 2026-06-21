import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, URL } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const require = createRequire(import.meta.url);

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};

// Load .env file if present (for local dev)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

http.createServer(async (req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/' || u === '') u = '/index.html';

  // API route handler
  if (req.method === 'POST' && u === '/api/submit') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body || '{}');
        // Build a minimal req/res shim matching Vercel's API shape
        const apiReq = { method: 'POST', body: parsed, headers: req.headers };
        const apiRes = {
          statusCode: 200,
          _headers: {},
          status(code) { this.statusCode = code; return this; },
          setHeader(k, v) { this._headers[k] = v; },
          json(data) {
            res.writeHead(this.statusCode, { 'Content-Type': 'application/json', ...this._headers });
            res.end(JSON.stringify(data));
          },
          end() {
            res.writeHead(this.statusCode, this._headers);
            res.end();
          },
        };
        // Clear require cache so env changes are picked up
        const handlerPath = path.join(__dirname, 'api', 'submit.js');
        delete require.cache[require.resolve(handlerPath)];
        const handler = require(handlerPath);
        await handler(apiReq, apiRes);
      } catch (err) {
        console.error('API handler error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }

  let fp = path.join(__dirname, u);
  if (!fp.startsWith(path.resolve(__dirname) + path.sep) && fp !== path.resolve(__dirname)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');

  fs.stat(fp, (err, stat) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }

    const ext = path.extname(fp);
    const contentType = MIME[ext] || 'application/octet-stream';
    const fileSize = stat.size;
    const rangeHeader = req.headers['range'];

    res.setHeader('Accept-Ranges', 'bytes');

    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Type': contentType,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunkSize,
      });
      fs.createReadStream(fp, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': fileSize });
      fs.createReadStream(fp).pipe(res);
    }
  });
}).listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
