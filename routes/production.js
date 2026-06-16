const express = require('express');
const db = require('../database/schema');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET - List production entries (with filters)
router.get('/', requireAuth, requireRole('admin', 'supervisor', 'data_entry'), (req, res) => {
  const { date, shift_id, machine_id } = req.query;
  let query = `
    SELECT pl.*, m.machine_name, m.machine_number, s.name as shift_name, u.name as entered_by_name
    FROM production_log pl
    JOIN machines m ON pl.machine_id = m.id
    JOIN shifts s ON pl.shift_id = s.id
    JOIN users u ON pl.entered_by = u.id
    WHERE 1=1
  `;
  const params = [];

  if (date) {
    query += ' AND pl.date = ?';
    params.push(date);
  }
  if (shift_id) {
    query += ' AND pl.shift_id = ?';
    params.push(shift_id);
  }
  if (machine_id) {
    query += ' AND pl.machine_id = ?';
    params.push(machine_id);
  }

  query += ' ORDER BY pl.date DESC, pl.created_at DESC LIMIT 100';

  const entries = db.prepare(query).all(...params);
  const shifts = db.prepare('SELECT * FROM shifts').all();
  const machines = db.prepare('SELECT * FROM machines').all();
  const today = date || new Date().toISOString().split('T')[0];

  res.render('production/list', { entries, shifts, machines, today, selectedShift: shift_id || '', selectedMachine: machine_id || '' });
});

// GET - Show add production entry form
router.get('/add', requireAuth, requireRole('admin', 'supervisor', 'data_entry'), (req, res) => {
  const shifts = db.prepare('SELECT * FROM shifts').all();
  const machines = db.prepare('SELECT * FROM machines WHERE status = ?').all('running');
  const today = new Date().toISOString().split('T')[0];
  res.render('production/entry', { shifts, machines, today, entry: null, error: null });
});

// POST - Add new production entry
router.post('/add', requireAuth, requireRole('admin', 'supervisor', 'data_entry'), (req, res) => {
  const { date, shift_id, machine_id, meters_produced, defect_meters, remarks } = req.body;

  if (!date || !shift_id || !machine_id || meters_produced === '' || meters_produced === undefined) {
    const shifts = db.prepare('SELECT * FROM shifts').all();
    const machines = db.prepare('SELECT * FROM machines WHERE status = ?').all('running');
    return res.render('production/entry', {
      shifts, machines, today: date,
      entry: req.body,
      error: 'Please fill in all required fields (Date, Shift, Machine, Meters)'
    });
  }

  db.prepare(
    'INSERT INTO production_log (date, shift_id, machine_id, meters_produced, defect_meters, remarks, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(date, shift_id, machine_id, parseFloat(meters_produced), parseFloat(defect_meters || 0), remarks || null, req.session.user.id);

  res.redirect('/production?date=' + date);
});

// POST - Delete production entry (admin & supervisor only)
router.post('/delete/:id', requireAuth, requireRole('admin', 'supervisor'), (req, res) => {
  db.prepare('DELETE FROM production_log WHERE id = ?').run(req.params.id);
  res.redirect('/production');
});

module.exports = router;