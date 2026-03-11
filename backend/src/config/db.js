import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Pool = a group of reusable connections to the database
// Instead of opening/closing a connection every time, we reuse them
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false  // Required for Supabase
  },
  max: 10,
});

// Test the connection when server starts
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected successfully!');
    release(); // Release the client back to the pool
  }
});

export default pool;