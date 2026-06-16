const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/schema');
const router = express.Router();

// GET login page
router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', { error: null });
});

// POST login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('login', { error: 'Please enter username and password' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    return res.render('login', { error: 'Invalid username or password' });
  }

  const validPassword = bcrypt.compareSync(password, user.password_hash);
  if (!validPassword) {
    return res.render('login', { error: 'Invalid username or password' });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role
  };

  res.redirect('/dashboard');
});

// GET logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;