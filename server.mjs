/**
 * Production static server for Firebase App Hosting / Cloud Run.
 * Must listen on process.env.PORT (defaults to 8080) and 0.0.0.0.
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8080;
const app = express();

const dist = path.join(__dirname, 'dist');
app.use(express.static(dist));

// SPA: non-static routes serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(dist, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`BuddyBubble static server listening on 0.0.0.0:${port}`);
});
