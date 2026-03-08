import { createServer } from 'node:http';
import { handleApiRequest } from '../lib/devApiServer.js';

const port = Number(process.env.VERCEL_PORT || 3000);

const server = createServer((req, res) => {
  void handleApiRequest(req, res);
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Local API server listening on http://127.0.0.1:${port}\n`);
});
