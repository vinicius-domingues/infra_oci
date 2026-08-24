const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure log directory exists
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Simple file logger helper
function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  fs.appendFile(path.join(logDir, 'app.log'), logLine, (err) => {
    if (err) console.error('Failed to write log:', err);
  });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to inject server and database metadata headers
app.use((req, res, next) => {
  res.setHeader('X-Server-Instance', os.hostname());
  res.setHeader('X-Database-Source', process.env.DB_HOST ? `MySQL (${process.env.DB_HOST})` : 'SQLite (clients.db)');
  next();
});

// Middleware to log requests to logs/app.log and inject delay
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const dbType = process.env.DB_HOST ? `MySQL (${process.env.DB_HOST})` : 'SQLite (clients.db)';
    const serverName = os.hostname();
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    const logMsg = `${clientIp} - ${req.method} ${req.originalUrl} - Status: ${res.statusCode} - Time: ${duration}ms - Server: ${serverName} - DB: ${dbType}`;
    writeLog(logMsg);
  });

  const delay = parseInt(req.query.delay) || 0;
  if (delay > 0) {
    setTimeout(next, delay);
  } else {
    next();
  }
});

// GET /api/clients - List clients (with limit and search by name, email or cpf)
app.get('/api/clients', (req, res) => {
  let { search, name, email, cpf, cpfStart, cpfEnd } = req.query;
  const limit = parseInt(req.query.limit) || 50; // default to 50 for performance
  
  // fallback for compatibility
  if (search && !name && !email && !cpf && !cpfStart && !cpfEnd) {
    const isNumeric = /^\d+$/.test(search.replace(/[-.]/g, ''));
    if (isNumeric) {
      cpf = search;
    } else if (search.includes('@')) {
      email = search;
    } else {
      name = search;
    }
  }

  let conditions = [];
  let params = [];

  if (name) {
    conditions.push("name LIKE ?");
    params.push(`%${name}%`);
  }
  
  if (email) {
    // Leading wildcard forces a full table scan, bypassing the unique index on email
    conditions.push("email LIKE ?");
    params.push(`%${email}%`);
  }
  
  if (cpf) {
    const cleanCpf = cpf.replace(/[-.]/g, '');
    conditions.push("cpf = ?");
    params.push(cleanCpf);
  }
  
  if (cpfStart && cpfEnd) {
    const cleanStart = cpfStart.replace(/[-.]/g, '');
    const cleanEnd = cpfEnd.replace(/[-.]/g, '');
    const isMySQL = !!process.env.DB_HOST;
    const castType = isMySQL ? 'UNSIGNED' : 'INTEGER';
    
    // Applying function conversions on the column forces a full table scan on 10M rows
    conditions.push(`CAST(REPLACE(REPLACE(cpf, '.', ''), '-', '') AS ${castType}) BETWEEN CAST(? AS ${castType}) AND CAST(? AS ${castType})`);
    params.push(cleanStart, cleanEnd);
  }

  if (conditions.length > 0) {
    const sql = `SELECT * FROM clients WHERE ${conditions.join(' AND ')} LIMIT ?`;
    params.push(limit);

    const dbStart = Date.now();
    db.all(sql, params, (err, rows) => {
      const dbDuration = Date.now() - dbStart;
      res.setHeader('X-Query-Time', `${dbDuration}`);
      
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  } else {
    // If no search parameter, return empty list (do not auto-load 10 million clients on startup)
    res.json([]);
  }
});

// POST /api/clients - Create client
app.post('/api/clients', (req, res) => {
  const { name, email, phone, cpf } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and Email are required.' });
  }

  const sql = `INSERT INTO clients (name, email, phone, cpf) VALUES (?, ?, ?, ?)`;
  db.run(sql, [name, email, phone, cpf], function(err) {
    if (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Email or CPF already exists.' });
      }
      return res.status(500).json({ error: err.message });
    }
    
    // Return the newly created client
    db.get(`SELECT * FROM clients WHERE id = ?`, [this.lastID], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json(row);
    });
  });
});

// DELETE /api/clients/:id - Delete client
app.delete('/api/clients/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM clients WHERE id = ?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Client not found.' });
    res.json({ message: 'Client deleted successfully.', id });
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to test the client`);
});
