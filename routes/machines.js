const express = require('express');
const db = require('../database/schema');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET - List all machines
router.get('/', requireAuth, requireRole('admin', 'supervisor'), (req, res) => {
  const machines = db.prepare('SELECT * FROM machines ORDER BY machine_number').all();
  res.render('machines/list', { machines });
});

// GET - Show add machine form
router.get('/add', requireAuth, requireRole('admin'), (req, res) => {
  res.render('machines/form', { machine: null, error: null });
});

// POST - Add new machine
router.post('/add', requireAuth, requireRole('admin'), (req, res) => {
  const { machine_number, machine_name, status } = req.body;

  if (!machine_number || !machine_name) {
    return res.render('machines/form', {
      machine: null,
      error: 'Machine number and name are required'
    });
  }

  try {
    db.prepare('INSERT INTO machines (machine_number, machine_name, status) VALUES (?, ?, ?)').run(
      machine_number, machine_name, status || 'idle'
    );
    res.redirect('/machines');
  } catch (err) {
    res.render('machines/form', {
      machine: null,
      error: 'Machine number already exists. Please use a different number.'
    });
  }
});

// GET - Show edit machine form
router.get('/edit/:id', requireAuth, requireRole('admin'), (req, res) => {
  const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(req.params.id);
  if (!machine) {
    return res.status(404).render('error', { message: 'Machine not found' });
  }
  res.render('machines/form', { machine, error: null });
});

// POST - Update machine
router.post('/edit/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { machine_number, machine_name, status } = req.body;
  const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(req.params.id);

  if (!machine) {
    return res.status(404).render('error', { message: 'Machine not found' });
  }

  if (!machine_number || !machine_name) {
    return res.render('machines/form', { machine, error: 'Machine number and name are required' });
  }

  try {
    db.prepare('UPDATE machines SET machine_number = ?, machine_name = ?, status = ? WHERE id = ?').run(
      machine_number, machine_name, status, req.params.id
    );
    res.redirect('/machines');
  } catch (err) {
    res.render('machines/form', { machine, error: 'Machine number already exists.' });
  }
});

// POST - Delete machine
router.post('/delete/:id', requireAuth, requireRole('admin'), (req, res) => {
  const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(req.params.id);
  if (!machine) {
    return res.status(404).render('error', { message: 'Machine not found' });
  }
  db.prepare('DELETE FROM machines WHERE id = ?').run(req.params.id);
  res.redirect('/machines');
});

module.exports = router;