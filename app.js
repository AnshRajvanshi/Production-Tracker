const express = require('express');
const session = require('express-session');
const path = require('path');
const helmet = require('helmet');
const expressLayouts = require('express-ejs-layouts');
const db = require('./database/schema');
const { loadUser } = require('./middleware/auth');

const app = express();

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to allow Chart.js CDN scripts
  crossOriginEmbedderPolicy: false // Disabled for CDN resources
}));

// Disable x-powered-by header
app.disable('x-powered-by');

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: 'prod-tracker-secure-key-6a9f8e2d1b7c4a0e3f5d8b2c1a9e7f4d',
  resave: false,
  saveUninitialized: false,
  name: 'productionTracker.sid', // Custom name instead of default 'connect.sid'
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 3600000, // 1 hour
    secure: false // Set to true if using HTTPS
  }
}));
app.use(loadUser);

// Routes
app.use('/', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/machines', require('./routes/machines'));
app.use('/production', require('./routes/production'));
app.use('/reports', require('./routes/reports'));

// Root redirect
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

// Error page
app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Production Tracking System running on http://localhost:${PORT}`);
  console.log(`  Login: http://localhost:${PORT}`);
  console.log(`  All users have secure passwords set.`);
});