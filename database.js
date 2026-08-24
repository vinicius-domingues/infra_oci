require('dotenv').config();
const path = require('path');

let db;

// Detect dynamic database provider based on environment variables
if (process.env.DB_HOST) {
  // Use MySQL setup
  console.log('Database configuration: MySQL selected.');
  const mysql = require('mysql2');
  
  db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // Create the table automatically if it does not exist
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(50),
      cpf VARCHAR(14) UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
  
  db.query(createTableQuery, (err) => {
    if (err) {
      console.error('Error creating MySQL clients table:', err.message);
    } else {
      console.log('MySQL clients table verified/created.');
      // Create index if not exists on MySQL
      db.query(`CREATE INDEX idx_clients_name ON clients(name)`, (idxErr) => {
        if (idxErr && idxErr.code !== 'ER_DUP_KEYNAME') {
          console.error('Error creating MySQL index on name:', idxErr.message);
        } else {
          console.log('MySQL index on name verified/created.');
        }
      });
    }
  });

  // Polyfill/wrapper to mimic SQLite API methods used in server.js
  db.all = (sql, params, callback) => {
    db.query(sql.replace(/\?/g, '?'), params, (err, results) => {
      callback(err, results);
    });
  };

  db.run = function(sql, params, callback) {
    db.query(sql, params, function(err, result) {
      if (err) return callback(err);
      // SQLite execution context holds "this.lastID" and "this.changes"
      const context = {
        lastID: result ? result.insertId : null,
        changes: result ? result.affectedRows : 0
      };
      callback.call(context, null);
    });
  };

  db.get = (sql, params, callback) => {
    db.query(sql, params, (err, results) => {
      if (err) return callback(err);
      callback(null, results && results.length > 0 ? results[0] : null);
    });
  };

} else {
  // Fallback to SQLite (local development default)
  console.log('Database configuration: SQLite selected (default).');
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.resolve(__dirname, 'clients.db');
  
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error connecting to SQLite:', err.message);
    } else {
      console.log('Connected to SQLite database at:', dbPath);
    }
  });

  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        cpf TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('Error creating SQLite table:', err.message);
      } else {
        console.log('SQLite clients table ready.');
        db.run(`CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)`, (idxErr) => {
          if (idxErr) console.error('Error creating SQLite name index:', idxErr.message);
          else console.log('SQLite name index ready.');
        });
      }
    });
  });
}

module.exports = db;
