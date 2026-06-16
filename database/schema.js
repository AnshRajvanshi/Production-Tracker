const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'production.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'supervisor', 'data_entry')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_number TEXT UNIQUE NOT NULL,
    machine_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('running', 'idle', 'maintenance', 'breakdown')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS production_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    shift_id INTEGER NOT NULL,
    machine_id INTEGER NOT NULL,
    meters_produced REAL NOT NULL CHECK(meters_produced >= 0),
    defect_meters REAL NOT NULL DEFAULT 0 CHECK(defect_meters >= 0),
    remarks TEXT,
    entered_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shift_id) REFERENCES shifts(id),
    FOREIGN KEY (machine_id) REFERENCES machines(id),
    FOREIGN KEY (entered_by) REFERENCES users(id)
  );
`);

// Seed default shifts
const shiftCount = db.prepare('SELECT COUNT(*) as count FROM shifts').get();
if (shiftCount.count === 0) {
  const insertShift = db.prepare('INSERT INTO shifts (name, start_time, end_time) VALUES (?, ?, ?)');
  insertShift.run('Day', '06:00', '18:00');
  insertShift.run('Night', '18:00', '06:00');
  console.log('✓ Seeded shifts: Day (06:00-18:00), Night (18:00-06:00)');
}

// Seed default users
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCount.count === 0) {
  const insertUser = db.prepare('INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)');
  insertUser.run('admin', bcrypt.hashSync('admin123', 10), 'Admin User', 'admin');
  insertUser.run('supervisor', bcrypt.hashSync('super123', 10), 'Supervisor', 'supervisor');
  insertUser.run('dataentry', bcrypt.hashSync('data123', 10), 'Data Entry Operator', 'data_entry');
  console.log('✓ Seeded users: admin, supervisor, dataentry');
}

// Seed sample machines
const machineCount = db.prepare('SELECT COUNT(*) as count FROM machines').get();
if (machineCount.count === 0) {
  const insertMachine = db.prepare('INSERT INTO machines (machine_number, machine_name, status) VALUES (?, ?, ?)');
  insertMachine.run('M-001', 'Machine 1', 'running');
  insertMachine.run('M-002', 'Machine 2', 'running');
  insertMachine.run('M-003', 'Machine 3', 'idle');
  console.log('✓ Seeded machines: Machine 1, Machine 2, Machine 3');
}

// Seed sample production data for the current month (for demo purposes)
const logCount = db.prepare('SELECT COUNT(*) as count FROM production_log').get();
if (logCount.count === 0) {
  const today = new Date();
  const insertLog = db.prepare(
    'INSERT INTO production_log (date, shift_id, machine_id, meters_produced, defect_meters, remarks, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  // Generate some sample data for the last 7 days
  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    const dateStr = date.toISOString().split('T')[0];

    // Day shift entries
    insertLog.run(dateStr, 1, 1, 500 + Math.floor(Math.random() * 200), Math.floor(Math.random() * 20), 'Sample day shift', 1);
    insertLog.run(dateStr, 1, 2, 450 + Math.floor(Math.random() * 200), Math.floor(Math.random() * 15), 'Sample day shift', 1);

    // Night shift entries
    insertLog.run(dateStr, 2, 1, 480 + Math.floor(Math.random() * 200), Math.floor(Math.random() * 18), 'Sample night shift', 1);
    insertLog.run(dateStr, 2, 2, 420 + Math.floor(Math.random() * 200), Math.floor(Math.random() * 12), 'Sample night shift', 1);
  }
  console.log('✓ Seeded sample production data (last 7 days)');
}

console.log('✓ Database initialized successfully');
module.exports = db;