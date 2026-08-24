require('dotenv').config();
const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const TOTAL_CLIENTS = 10000000;
const BATCH_SIZE = 10000; // insert in chunks to save memory on 1GB RAM

// Helper helper function to execute run inside a Promise
function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

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
        const cpf = `${String(idNum).padStart(11, '0')}`;
        
        values.push([name, email, phone, cpf]);
      }

      await connection.query(
        'INSERT INTO clients (name, email, phone, cpf) VALUES ?', 
        [values]
      );
      
      const idNumToShow = i + chunkLimit;
      if (idNumToShow % 100000 === 0) {
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

    // Helper wrapper for serializing table setup
    await new Promise((resolve, reject) => {
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
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    console.log('Populating SQLite with 10M rows using fast multi-row inserts...');
    
    await runQuery(db, 'BEGIN TRANSACTION;');

    try {
      // SQLite parameter limit is 999, so we insert 200 rows (800 parameters) per query
      const SQLITE_INSERT_BATCH = 200;
      
      // Pre-compile the insert query for SQLITE_INSERT_BATCH rows
      const placeholders = Array(SQLITE_INSERT_BATCH).fill('(?, ?, ?, ?)').join(', ');
      const insertSql = `INSERT INTO clients (name, email, phone, cpf) VALUES ${placeholders}`;
      const stmt = db.prepare(insertSql);

      for (let i = 0; i < TOTAL_CLIENTS; i += SQLITE_INSERT_BATCH) {
        const chunkLimit = Math.min(SQLITE_INSERT_BATCH, TOTAL_CLIENTS - i);
        
        if (chunkLimit === SQLITE_INSERT_BATCH) {
          const params = [];
          for (let j = 0; j < chunkLimit; j++) {
            const k = i + j + 1;
            params.push(
              `Cliente ${k}`,
              `cliente${k}@exemplo.com`,
              `(11) 9${String(k).padStart(8, '0')}`.substring(0, 15),
              `${String(k).padStart(11, '0')}`
            );
          }
          
          await new Promise((resolve, reject) => {
            stmt.run(params, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        } else {
          // Handle the last remaining rows that don't fill a whole batch of 200
          const remainingPlaceholders = Array(chunkLimit).fill('(?, ?, ?, ?)').join(', ');
          const remainingSql = `INSERT INTO clients (name, email, phone, cpf) VALUES ${remainingPlaceholders}`;
          const params = [];
          for (let j = 0; j < chunkLimit; j++) {
            const k = i + j + 1;
            params.push(
              `Cliente ${k}`,
              `cliente${k}@exemplo.com`,
              `(11) 9${String(k).padStart(8, '0')}`.substring(0, 15),
              `${String(k).padStart(11, '0')}`
            );
          }
          await runQuery(db, remainingSql, params);
        }

        const progress = i + chunkLimit;
        if (progress % 500000 === 0) {
          console.log(`Inserted ${progress}/${TOTAL_CLIENTS} clients in SQLite...`);
        }
      }

      stmt.finalize();
      await runQuery(db, 'COMMIT;');
      console.log('SQLite Data population completed successfully.');
    } catch (error) {
      await runQuery(db, 'ROLLBACK;');
      console.error('SQLite population error, transaction rolled back:', error);
    } finally {
      db.close();
    }
  }
}

generateData().catch(console.error);
