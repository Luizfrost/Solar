import express from "express";
import Database from "better-sqlite3";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import fs from "fs";
import { fileURLToPath } from 'url';

// Configurar __dirname para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurar banco de dados para produção
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/var/data/church.db'
  : path.join(__dirname, 'church.db');

// Criar diretório se não existir
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Inicializar database
db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    photo TEXT
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    abertura TEXT,
    dizimo TEXT,
    palavra TEXT,
    recepcao TEXT,
    recepcao2 TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT DEFAULT CURRENT_TIMESTAMP,
    author TEXT,
    content TEXT NOT NULL,
    userId INTEGER,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    permissions TEXT NOT NULL,
    fullName TEXT,
    phone TEXT,
    address TEXT,
    maritalStatus TEXT,
    churchRole TEXT,
    photo TEXT
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    content TEXT NOT NULL,
    image TEXT,
    type TEXT DEFAULT 'text',
    date TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    content TEXT NOT NULL,
    date TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Seed default admin
const adminExists = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
if (!adminExists) {
  db.prepare("INSERT INTO users (username, password, permissions) VALUES (?, ?, ?)")
    .run("admin", "admin123", JSON.stringify(["all"]));
  console.log("Default admin user created: admin / admin123");
} else {
  db.prepare("UPDATE users SET password = ? WHERE username = 'admin'").run("admin123");
  console.log("Admin password reset to admin123");
}

// Seed default settings
const titheEnabled = db.prepare("SELECT * FROM settings WHERE key = 'tithe_enabled'").get();
if (!titheEnabled) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("tithe_enabled", "false");
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("tithe_qr_code", "");
}

// Migrations
const migrations = [
  { table: 'schedules', column: 'recepcao2', type: 'TEXT' },
  { table: 'users', column: 'fullName', type: 'TEXT' },
  { table: 'users', column: 'phone', type: 'TEXT' },
  { table: 'users', column: 'address', type: 'TEXT' },
  { table: 'users', column: 'maritalStatus', type: 'TEXT' },
  { table: 'users', column: 'churchRole', type: 'TEXT' },
  { table: 'users', column: 'photo', type: 'TEXT' },
  { table: 'notices', column: 'userId', type: 'INTEGER' },
];

migrations.forEach(m => {
  try {
    db.prepare(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`).run();
  } catch (e) {}
});

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

  // Auth API
  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ? AND password = ?").get(username, password) as any;
    if (user) {
      const { password, ...userWithoutPassword } = user;
      res.json({ 
        ...userWithoutPassword,
        permissions: JSON.parse(user.permissions) 
      });
    } else {
      res.status(401).json({ error: "Credenciais inválidas" });
    }
  });

  app.put("/api/profile/:id", (req, res) => {
    const { fullName, phone, address, maritalStatus, churchRole, photo, password } = req.body;
    try {
      if (password) {
        db.prepare(`
          UPDATE users SET 
            fullName = ?, phone = ?, address = ?, 
            maritalStatus = ?, churchRole = ?, photo = ?, password = ?
          WHERE id = ?
        `).run(fullName, phone, address, maritalStatus, churchRole, photo, password, req.params.id);
      } else {
        db.prepare(`
          UPDATE users SET 
            fullName = ?, phone = ?, address = ?, 
            maritalStatus = ?, churchRole = ?, photo = ?
          WHERE id = ?
        `).run(fullName, phone, address, maritalStatus, churchRole, photo, req.params.id);
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Posts API
  app.get("/api/posts/:userId", (req, res) => {
    const rows = db.prepare("SELECT * FROM posts WHERE userId = ? ORDER BY date DESC").all(req.params.userId);
    res.json(rows);
  });

  app.post("/api/posts", (req, res) => {
    const { userId, content, image, type } = req.body;
    try {
      const info = db.prepare("INSERT INTO posts (userId, content, image, type) VALUES (?, ?, ?, ?)")
        .run(userId, content, image, type);
      res.json({ id: info.lastInsertRowid });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/posts/:id", (req, res) => {
    try {
      const result = db.prepare("DELETE FROM posts WHERE id = ?").run(Number(req.params.id));
      res.json({ success: true, changes: result.changes });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Chat API
  app.get("/api/chat", (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const rows = db.prepare(`
      SELECT chat_messages.*, users.username, users.photo, users.fullName 
      FROM chat_messages 
      JOIN users ON chat_messages.userId = users.id 
      ORDER BY date DESC LIMIT ? OFFSET ?
    `).all(limit, offset);
    res.json(rows.reverse());
  });

  app.post("/api/chat/typing", (req, res) => {
    const { userId, username, isTyping } = req.body;
    broadcast({ type: 'TYPING_INDICATOR', userId, username, isTyping });
    res.json({ success: true });
  });

  app.post("/api/chat", (req, res) => {
    const { userId, content } = req.body;
    try {
      const info = db.prepare("INSERT INTO chat_messages (userId, content) VALUES (?, ?)")
        .run(userId, content);
      const message = db.prepare(`
        SELECT chat_messages.*, users.username, users.photo, users.fullName 
        FROM chat_messages 
        JOIN users ON chat_messages.userId = users.id 
        WHERE chat_messages.id = ?
      `).get(info.lastInsertRowid);
      broadcast({ type: 'CHAT_MESSAGE', message });
      res.json(message);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Users API
  app.get("/api/users", (req, res) => {
    const rows = db.prepare("SELECT id, username, permissions, fullName, photo FROM users").all();
    res.json(rows.map((r: any) => ({ ...r, permissions: JSON.parse(r.permissions) })));
  });

  app.post("/api/users", (req, res) => {
    const { username, password, permissions } = req.body;
    try {
      const info = db.prepare("INSERT INTO users (username, password, permissions) VALUES (?, ?, ?)")
        .run(username, password, JSON.stringify(permissions));
      res.json({ id: info.lastInsertRowid });
    } catch (e: any) {
      res.status(400).json({ error: "Usuário já existe ou dados inválidos" });
    }
  });

  app.delete("/api/users/:id", (req, res) => {
    try {
      const result = db.prepare("DELETE FROM users WHERE id = ?").run(Number(req.params.id));
      res.json({ success: true, changes: result.changes });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Settings API
  app.get("/api/settings", (req, res) => {
    const rows = db.prepare("SELECT * FROM settings").all();
    const settings: any = {};
    rows.forEach((r: any) => settings[r.key] = r.value);
    res.json(settings);
  });

  app.post("/api/settings", (req, res) => {
    const { key, value } = req.body;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
    res.json({ success: true });
  });

  // Members API
  app.get("/api/members", (req, res) => {
    const rows = db.prepare("SELECT * FROM members ORDER BY name ASC").all();
    res.json(rows);
  });

  app.post("/api/members", (req, res) => {
    const { name, photo } = req.body;
    try {
      const info = db.prepare("INSERT INTO members (name, photo) VALUES (?, ?)").run(name, photo);
      res.json({ id: info.lastInsertRowid });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put("/api/members/:id", (req, res) => {
    const { name, photo } = req.body;
    try {
      db.prepare("UPDATE members SET name = ?, photo = ? WHERE id = ?").run(name, photo, req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/members/:id", (req, res) => {
    try {
      const result = db.prepare("DELETE FROM members WHERE id = ?").run(Number(req.params.id));
      res.json({ success: true, changes: result.changes });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Schedules API
  app.get("/api/schedules", (req, res) => {
    const month = req.query.month;
    let query = "SELECT * FROM schedules";
    let params = [];
    if (month) {
      query += " WHERE date LIKE ?";
      params.push(`${month}%`);
    }
    query += " ORDER BY date ASC";
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  });

  app.post("/api/schedules", (req, res) => {
    const { date, abertura, dizimo, palavra, recepcao, recepcao2 } = req.body;
    try {
      const info = db.prepare(
        "INSERT INTO schedules (date, abertura, dizimo, palavra, recepcao, recepcao2) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(date, abertura, dizimo, palavra, recepcao, recepcao2);
      broadcast({ type: 'NOTIFICATION', title: 'Nova Escala!', message: `Uma nova escala foi postada para o dia ${date}.` });
      res.json({ id: info.lastInsertRowid });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put("/api/schedules/:id", (req, res) => {
    const { date, abertura, dizimo, palavra, recepcao, recepcao2 } = req.body;
    try {
      db.prepare(
        "UPDATE schedules SET date = ?, abertura = ?, dizimo = ?, palavra = ?, recepcao = ?, recepcao2 = ? WHERE id = ?"
      ).run(date, abertura, dizimo, palavra, recepcao, recepcao2, req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/schedules/:id", (req, res) => {
    try {
      const result = db.prepare("DELETE FROM schedules WHERE id = ?").run(Number(req.params.id));
      res.json({ success: true, changes: result.changes });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Events API
  app.get("/api/events", (req, res) => {
    const rows = db.prepare("SELECT * FROM events ORDER BY date ASC").all();
    res.json(rows);
  });

  app.post("/api/events", (req, res) => {
    const { date, title, description } = req.body;
    try {
      const info = db.prepare(
        "INSERT INTO events (date, title, description) VALUES (?, ?, ?)"
      ).run(date, title, description);
      broadcast({ type: 'NOTIFICATION', title: 'Novo Evento!', message: `Evento: ${title}` });
      res.json({ id: info.lastInsertRowid });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put("/api/events/:id", (req, res) => {
    const { date, title, description } = req.body;
    try {
      db.prepare(
        "UPDATE events SET date = ?, title = ?, description = ? WHERE id = ?"
      ).run(date, title, description, req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/events/:id", (req, res) => {
    try {
      const result = db.prepare("DELETE FROM events WHERE id = ?").run(Number(req.params.id));
      res.json({ success: true, changes: result.changes });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Notices API
  app.get("/api/notices", (req, res) => {
    const rows = db.prepare(`
      SELECT notices.*, users.username, users.photo, users.fullName 
      FROM notices 
      LEFT JOIN users ON notices.userId = users.id 
      ORDER BY date DESC
    `).all();
    res.json(rows);
  });

  app.post("/api/notices", (req, res) => {
    const { author, content, userId } = req.body;
    try {
      const info = db.prepare(
        "INSERT INTO notices (author, content, userId) VALUES (?, ?, ?)"
      ).run(author, content, userId);
      broadcast({ type: 'NOTIFICATION', title: 'Novo Recado no Mural!', message: content.substring(0, 50) + '...' });
      res.json({ id: info.lastInsertRowid });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put("/api/notices/:id", (req, res) => {
    const { author, content, userId } = req.body;
    try {
      db.prepare(
        "UPDATE notices SET author = ?, content = ?, userId = ? WHERE id = ?"
      ).run(author, content, userId, req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/notices/:id", (req, res) => {
    try {
      const result = db.prepare("DELETE FROM notices WHERE id = ?").run(Number(req.params.id));
      res.json({ success: true, changes: result.changes });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

   // Servir arquivos estáticos - CORRIGIDO
  const distPath = path.join(__dirname, "dist");
  console.log(`📁 Servindo arquivos estáticos de: ${distPath}`);
  
  // Verificar se a pasta dist existe
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    console.warn("⚠️ Pasta dist não encontrada. Execute 'npm run build' primeiro.");
  }

  // CORREÇÃO: Especificar tipos para o listen
  const HOST: string = "0.0.0.0";
  const PORT_NUMBER: number = Number(PORT);
  
  server.listen(PORT_NUMBER, HOST, () => {
    console.log(`✅ Servidor rodando em http://${HOST}:${PORT_NUMBER}`);
    console.log(`🌐 Acesse localmente: http://localhost:${PORT_NUMBER}`);
    console.log(`🔑 Login: admin / admin123`);
  });
}

startServer().catch(console.error);