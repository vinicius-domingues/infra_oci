const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to inject an artificial delay if requested
app.use((req, res, next) => {
  const delay = parseInt(req.query.delay) || 0;
  if (delay > 0) {
    setTimeout(next, delay);
  } else {
    next();
  }
});

// GET /api/clients - List clients (with limit and search by name, email or cpf)
app.get('/api/clients', (req, res) => {
  const queryVal = req.query.search;
  const limit = parseInt(req.query.limit) || 50; // default to 50 for performance
  
  if (queryVal) {
    // If searching, execute query scanning multiple fields
    const sql = `
      SELECT * FROM clients 
      WHERE email LIKE ? 
         OR name LIKE ? 
         OR cpf LIKE ? 
      ORDER BY id DESC 
      LIMIT ?
    `;
    const param = `%${queryVal}%`;
    db.all(sql, [param, param, param, limit], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  } else {
    db.all(`SELECT * FROM clients ORDER BY id DESC LIMIT ?`, [limit], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
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
