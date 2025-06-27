import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function initDatabase() {
  const db = await open({
    filename: join(__dirname, '../../tasks.db'),
    driver: sqlite3.Database,
  });
  
  // Create table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      completed BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
  `);
  
  console.log('Database initialized');
  
  return db;
}

export async function getDb() {
  const db = await open({
    filename: join(__dirname, '../../tasks.db'),
    driver: sqlite3.Database,
  });
  return db;
}