import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import React from 'react';
import { renderToPipeableStream } from 'react-dom/server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, 'dist/client');
const MANIFEST_PATH = path.join(__dirname, 'dist/server/.vite/manifest.json');

// Read Vite manifest for asset mapping
let manifest = {};
try {
  const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf-8');
  manifest = JSON.parse(manifestContent);
} catch (e) {
  console.warn('Could not load Vite manifest:', e.message);
}

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

// Get asset path from manifest
function getAssetPath(file) {
  if (manifest[file]?.file) {
    return manifest[file].file;
  }
  return file;
}

const server = http.createServer((req, res) => {
  // Set CORS and security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Handle OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // Serve static assets
  if (req.url.startsWith('/assets/')) {
    const filePath = path.join(CLIENT_DIR, req.url);
    const normalizedPath = path.normalize(filePath);

    // Security: prevent directory traversal
    if (!normalizedPath.startsWith(CLIENT_DIR)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const cacheControl = 'public, max-age=31536000, immutable';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl
      });
      res.end(content);
    });
    return;
  }

  // Serve index.html for all other routes (SPA behavior)
  const indexPath = path.join(CLIENT_DIR, 'index.html');
  fs.readFile(indexPath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', message: err.message }));
      return;
    }

    // HTML with meta tags for SSR
    let html = content.toString();

    // Inject environment data if needed
    const envData = {
      SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
      SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
    };

    // Add env data as window global
    const envScript = `
    <script>
      window.__ENV__ = ${JSON.stringify(envData)};
    </script>
    `;

    html = html.replace('</head>', envScript + '</head>');

    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache, max-age=0'
    });
    res.end(html);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ SSR Server running on http://0.0.0.0:${PORT}`);
  console.log(`✓ Client assets: ${CLIENT_DIR}`);
  console.log(`✓ Health check: http://localhost:${PORT}/health`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
