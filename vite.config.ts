import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import { defineConfig, type Connect, type PluginOption, type ViteDevServer } from 'vite';
import { handleApiRequest } from './lib/devApiServer.js';

function localApiPlugin(): PluginOption {
  return {
    name: 'shorty-local-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((
        req: Connect.IncomingMessage,
        res: ServerResponse<IncomingMessage>,
        next: Connect.NextFunction
      ) => {
        if (!(req.url ?? '').startsWith('/api')) {
          next();
          return;
        }

        void handleApiRequest(req, res).catch(next);
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localApiPlugin()],
  define: {
    // Analytics: Mark this project as created via create-cloudinary-react CLI
    'process.env.CLOUDINARY_SOURCE': '"cli"',
    'process.env.CLD_CLI': '"true"',
  },
});
