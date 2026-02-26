// server-build.ts
import express from "express";
import Database from "better-sqlite3";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

const db = new Database("church.db");

// ... (todo o código do server.ts, exceto a parte do Vite)

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = process.env.PORT || 3000;

  const broadcast = (message: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  };

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Copie TODAS as rotas API do server.ts aqui
  // ... (todo o código das APIs)

  // Serve arquivos estáticos em produção
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();