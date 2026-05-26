const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        google_id VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        avatar VARCHAR(500),
        role VARCHAR(20) DEFAULT 'member',
        department VARCHAR(100) DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS session (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
      );
      CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);

      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        note TEXT DEFAULT '',
        priority VARCHAR(10) DEFAULT 'mid',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        due DATE,
        priority VARCHAR(10) DEFAULT 'mid',
        owner_name VARCHAR(100) DEFAULT '',
        done BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        channel VARCHAR(100) DEFAULT 'general',
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_chat_channel ON chat_messages(channel, created_at DESC);

      CREATE TABLE IF NOT EXISTS postits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT DEFAULT '',
        color VARCHAR(20) DEFAULT '#fff3a3',
        pos_x INTEGER DEFAULT 100,
        pos_y INTEGER DEFAULT 100,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS assets (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        qty INTEGER DEFAULT 0,
        min_qty INTEGER DEFAULT 0,
        owner_name VARCHAR(100) DEFAULT '',
        status VARCHAR(20) DEFAULT '정상',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trips (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        purpose VARCHAR(255) NOT NULL,
        destination VARCHAR(255) DEFAULT '',
        start_date DATE,
        end_date DATE,
        status VARCHAR(20) DEFAULT '승인 대기',
        memo TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS vacation (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        total DECIMAL(4,1) DEFAULT 15,
        used DECIMAL(4,1) DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS card_records (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        date DATE,
        merchant VARCHAR(255) DEFAULT '',
        category VARCHAR(100) DEFAULT '',
        amount INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ops_memo (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        content TEXT DEFAULT ''
      );
    `);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('DB init error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
