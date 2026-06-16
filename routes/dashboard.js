const express = require('express');
const db = require('../database/schema');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().split('T')[0];

  // Today's production - single query
  const todayStats = db.prepare(`
    SELECT 
      COALESCE(SUM(meters_produced), 0) as total_meters,
      COALESCE(SUM(defect_meters), 0) as total_defects
    FROM production_log WHERE date = ?
  `).get(today);

  // This month's production
  const monthStats = db.prepare(`
    SELECT 
      COALESCE(SUM(meters_produced), 0) as total_meters,
      COALESCE(SUM(defect_meters), 0) as total_defects
    FROM production_log WHERE date >= ?
  `).get(firstDayOfMonth);

  // Yesterday's production for comparison
  const yesterdayStats = db.prepare(`
    SELECT COALESCE(SUM(meters_produced), 0) as total_meters
    FROM production_log WHERE date = ?
  `).get(yesterday);

  // Active machines count
  const activeMachines = db.prepare(`
    SELECT COUNT(*) as count FROM machines WHERE status = 'running'
  `).get();

  // Total machines
  const totalMachines = db.prepare(`SELECT COUNT(*) as count FROM machines`).get();

  // Last 7 days production data for chart
  const weeklyData = db.prepare(`
    SELECT date, SUM(meters_produced) as total, SUM(defect_meters) as defects
    FROM production_log
    WHERE date >= date('now', '-7 days')
    GROUP BY date
    ORDER BY date ASC
  `).all();

  // Machine-wise production today
  const machineToday = db.prepare(`
    SELECT m.machine_name, m.machine_number, 
           COALESCE(SUM(pl.meters_produced), 0) as total,
           COALESCE(SUM(pl.defect_meters), 0) as defects
    FROM machines m
    LEFT JOIN production_log pl ON m.id = pl.machine_id AND pl.date = ?
    GROUP BY m.id
    ORDER BY m.machine_number
  `).all(today);

  const todayDefectPct = todayStats.total_meters > 0 
    ? ((todayStats.total_defects / todayStats.total_meters) * 100).toFixed(1) 
    : 0;

  const monthDefectPct = monthStats.total_meters > 0 
    ? ((monthStats.total_defects / monthStats.total_meters) * 100).toFixed(1) 
    : 0;

  // Comparison vs yesterday
  const vsYesterday = yesterdayStats.total_meters > 0
    ? (((todayStats.total_meters - yesterdayStats.total_meters) / yesterdayStats.total_meters) * 100).toFixed(1)
    : 0;

  res.render('dashboard', {
    todayMeters: todayStats.total_meters,
    todayDefects: todayStats.total_defects,
    todayDefectPct,
    monthMeters: monthStats.total_meters,
    monthDefects: monthStats.total_defects,
    monthDefectPct,
    activeMachines: activeMachines.count,
    totalMachines: totalMachines.count,
    vsYesterday,
    weeklyData,
    machineToday
  });
});

module.exports = router;