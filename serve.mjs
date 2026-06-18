import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};

http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/' || u === '') u = '/index.html';
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
