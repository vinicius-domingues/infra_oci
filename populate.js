require('dotenv').config();
const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const TOTAL_CLIENTS = 1000000;
const BATCH_SIZE = 10000; // insert in chunks to save memory on 1GB RAM

async function generateData() {
  console.log(`Starting data generation of ${TOTAL_CLIENTS} clients...`);
  
  if (process.env.DB_HOST) {
    // Generate for MySQL
    console.log('Target: MySQL database.');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: true
    });

    console.log('Ensuring clients table exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(50),
        cpf VARCHAR(14) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Truncate to reset clean state for test
    console.log('Clearing old clients records...');
    await connection.query('TRUNCATE TABLE clients;');

    for (let i = 0; i < TOTAL_CLIENTS; i += BATCH_SIZE) {
      const values = [];
      const chunkLimit = Math.min(BATCH_SIZE, TOTAL_CLIENTS - i);

      for (let j = 0; j < chunkLimit; j++) {
        const idNum = i + j + 1;
        const name = `Cliente ${idNum}`;
        const email = `cliente${idNum}@exemplo.com`;
        const phone = `(11) 9${String(idNum).padStart(8, '0')}`.substring(0, 15);
        // Raw sequence mock CPF - formatting logic creates target values for scan
        const cpf = `${String(idNum).padStart(11, '0')}`;
        
        values.push([name, email, phone, cpf]);
      }

      await connection.query(
        'INSERT INTO clients (name, email, phone, cpf) VALUES ?', 
        [values]
      );
      
      if (idNumToShow = i + chunkLimit) {
        console.log(`Inserted ${idNumToShow}/${TOTAL_CLIENTS} clients in MySQL...`);
      }
    }

    await connection.end();
    console.log('MySQL Data population completed successfully.');
    
  } else {
    // Generate for SQLite
    console.log('Target: SQLite database.');
    const dbPath = path.resolve(__dirname, 'clients.db');
    const db = new sqlite3.Database(dbPath);

    db.serialize(() => {
      db.run('DROP TABLE IF EXISTS clients;');
      db.run(`
        CREATE TABLE clients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          phone TEXT,
          cpf TEXT UNIQUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('Populating SQLite with 1M rows...');
      db.run('BEGIN TRANSACTION;');
      
      const stmt = db.prepare('INSERT INTO clients (name, email, phone, cpf) VALUES (?, ?, ?, ?)');
      for (let k = 1; k <= TOTAL_CLIENTS; k++) {
        const name = `Cliente ${k}`;
        const email = `cliente${k}@exemplo.com`;
        const phone = `(11) 9${String(k).padStart(8, '0')}`.substring(0, 15);
        const cpf = `${String(k).padStart(11, '0')}`;
        
        stmt.run(name, email, phone, cpf);
        
        if (k % 100000 === 0) {
          console.log(`Prepared ${k}/${TOTAL_CLIENTS} clients in SQLite...`);
        }
      }
      
      stmt.finalize();
      db.run('COMMIT;', (err) => {
        if (err) {
          console.error('Transaction error:', err);
        } else {
          console.log('SQLite Data population completed successfully.');
        }
        db.close();
      });
    });
  }
}

generateData().catch(console.error);
