import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import compression from 'compression';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, 'dist/client');
const SERVER_DIR = path.join(__dirname, 'dist/server');

app.use(compression());

// Serve static assets with long cache
app.use('/assets', express.static(path.join(CLIENT_DIR, 'assets'), {
  maxAge: '1y',
  etag: false
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve index.html for all routes (SPA behavior)
app.use(async (req, res) => {
  const indexPath = path.join(CLIENT_DIR, 'index.html');
  const fs = await import('fs/promises');

  try {
    let html = await fs.readFile(indexPath, 'utf-8');

    // Inject environment variables
    const envData = {
      SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://tsiwphacgpflljnuvxax.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzaXdwaGFjZ3BmbGxqbnV2eGF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MDMzNzYsImV4cCI6MjA5MzA3OTM3Nn0.c-FYqzjtLvchSVHSHEbqsSZLh1ro6j9d_m_3_FGLuMI'
    };

    const envScript = `<script>window.__ENV__ = ${JSON.stringify(envData)}</script>`;
    html = html.replace('</head>', envScript + '</head>');

    res.set('Content-Type', 'text/html');
    res.set('Cache-Control', 'no-cache, max-age=0');
    res.send(html);
  } catch (e) {
    console.error('Error serving index.html:', e);
    res.status(500).json({ error: 'Internal Server Error', message: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ TanStack SSR Server running on http://0.0.0.0:${PORT}`);
  console.log(`✓ Client dir: ${CLIENT_DIR}`);
  console.log(`✓ Health: http://localhost:${PORT}/health`);
});

app.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  process.exit(0);
});
