const express = require('express');
const db = require('../database/schema');
const ExcelJS = require('exceljs');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET - Reports home/selector
router.get('/', requireAuth, requireRole('admin', 'supervisor'), (req, res) => {
  const shifts = db.prepare('SELECT * FROM shifts').all();
  const machines = db.prepare('SELECT * FROM machines').all();
  const today = new Date().toISOString().split('T')[0];
  res.render('reports/index', { shifts, machines, today });
});

// GET - Daily report
router.get('/daily', requireAuth, requireRole('admin', 'supervisor'), (req, res) => {
  const { date } = req.query;
  const reportDate = date || new Date().toISOString().split('T')[0];

  const entries = db.prepare(`
    SELECT s.name as shift_name, m.machine_name, m.machine_number,
           pl.meters_produced, pl.defect_meters, pl.remarks
    FROM production_log pl
    JOIN shifts s ON pl.shift_id = s.id
    JOIN machines m ON pl.machine_id = m.id
    WHERE pl.date = ?
    ORDER BY s.name, m.machine_name
  `).all(reportDate);

  const summary = db.prepare(`
    SELECT 
      COALESCE(SUM(meters_produced), 0) as total_meters,
      COALESCE(SUM(defect_meters), 0) as total_defects,
      COUNT(DISTINCT machine_id) as machine_count
    FROM production_log WHERE date = ?
  `).get(reportDate);

  const defectPct = summary.total_meters > 0
    ? ((summary.total_defects / summary.total_meters) * 100).toFixed(1)
    : 0;

  res.render('reports/daily', { entries, summary, defectPct, reportDate });
});

// GET - Export Daily Report to Excel
router.get('/daily/export', requireAuth, requireRole('admin', 'supervisor'), async (req, res) => {
  const { date } = req.query;
  const reportDate = date || new Date().toISOString().split('T')[0];

  const entries = db.prepare(`
    SELECT s.name as shift_name, m.machine_name, m.machine_number,
           pl.meters_produced, pl.defect_meters, pl.remarks
    FROM production_log pl
    JOIN shifts s ON pl.shift_id = s.id
    JOIN machines m ON pl.machine_id = m.id
    WHERE pl.date = ?
    ORDER BY s.name, m.machine_name
  `).all(reportDate);

  const summary = db.prepare(`
    SELECT 
      COALESCE(SUM(meters_produced), 0) as total_meters,
      COALESCE(SUM(defect_meters), 0) as total_defects,
      COUNT(DISTINCT machine_id) as machine_count
    FROM production_log WHERE date = ?
  `).get(reportDate);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Production Tracker';
  const sheet = workbook.addWorksheet('Daily Report');

  // Title
  sheet.mergeCells('A1:F1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Daily Production Report - ${reportDate}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };

  // Summary
  sheet.addRow([]);
  sheet.addRow(['Total Meters', summary.total_meters, 'Total Defects', summary.total_defects, 'Defect %', summary.total_meters > 0 ? ((summary.total_defects / summary.total_meters) * 100).toFixed(1) + '%' : '0%']);
  sheet.addRow([]);

  // Header row
  const headerRow = sheet.addRow(['Shift', 'Machine', 'Machine #', 'Meters Produced', 'Defect Meters', 'Defect %']);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Data rows
  entries.forEach(entry => {
    const pct = entry.meters_produced > 0 ? ((entry.defect_meters / entry.meters_produced) * 100).toFixed(1) + '%' : '0%';
    const row = sheet.addRow([entry.shift_name, entry.machine_name, entry.machine_number, entry.meters_produced, entry.defect_meters, pct]);
    row.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  if (entries.length === 0) {
    sheet.addRow(['No data for this date']);
  }

  // Column widths
  sheet.getColumn(1).width = 15;
  sheet.getColumn(2).width = 20;
  sheet.getColumn(3).width = 15;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 15;
  sheet.getColumn(6).width = 12;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="daily-report-${reportDate}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// GET - Weekly report
router.get('/weekly', requireAuth, requireRole('admin', 'supervisor'), (req, res) => {
  const { start_date } = req.query;
  const startDate = start_date || new Date().toISOString().split('T')[0];
  const sd = new Date(startDate);
  const endDate = new Date(sd);
  endDate.setDate(endDate.getDate() + 6);

  const sdStr = sd.toISOString().split('T')[0];
  const edStr = endDate.toISOString().split('T')[0];

  const entries = db.prepare(`
    SELECT pl.date, s.name as shift_name, m.machine_name,
           pl.meters_produced, pl.defect_meters
    FROM production_log pl
    JOIN shifts s ON pl.shift_id = s.id
    JOIN machines m ON pl.machine_id = m.id
    WHERE pl.date >= ? AND pl.date <= ?
    ORDER BY pl.date, s.name, m.machine_name
  `).all(sdStr, edStr);

  const dailySummary = db.prepare(`
    SELECT date, 
           SUM(meters_produced) as total_meters,
           SUM(defect_meters) as total_defects
    FROM production_log
    WHERE date >= ? AND date <= ?
    GROUP BY date
    ORDER BY date
  `).all(sdStr, edStr);

  const totalMeters = dailySummary.reduce((sum, d) => sum + d.total_meters, 0);
  const totalDefects = dailySummary.reduce((sum, d) => sum + d.total_defects, 0);
  const defectPct = totalMeters > 0 ? ((totalDefects / totalMeters) * 100).toFixed(1) : 0;

  res.render('reports/weekly', { entries, dailySummary, totalMeters, totalDefects, defectPct, sdStr, edStr });
});

// GET - Export Weekly Report to Excel
router.get('/weekly/export', requireAuth, requireRole('admin', 'supervisor'), async (req, res) => {
  const { start_date } = req.query;
  const startDate = start_date || new Date().toISOString().split('T')[0];
  const sd = new Date(startDate);
  const endDate = new Date(sd);
  endDate.setDate(endDate.getDate() + 6);
  const sdStr = sd.toISOString().split('T')[0];
  const edStr = endDate.toISOString().split('T')[0];

  const entries = db.prepare(`
    SELECT pl.date, s.name as shift_name, m.machine_name,
           pl.meters_produced, pl.defect_meters
    FROM production_log pl
    JOIN shifts s ON pl.shift_id = s.id
    JOIN machines m ON pl.machine_id = m.id
    WHERE pl.date >= ? AND pl.date <= ?
    ORDER BY pl.date, s.name, m.machine_name
  `).all(sdStr, edStr);

  const dailySummary = db.prepare(`
    SELECT date, 
           SUM(meters_produced) as total_meters,
           SUM(defect_meters) as total_defects
    FROM production_log
    WHERE date >= ? AND date <= ?
    GROUP BY date
    ORDER BY date
  `).all(sdStr, edStr);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Production Tracker';
  const sheet = workbook.addWorksheet('Weekly Report');

  // Title
  sheet.mergeCells('A1:E1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Weekly Production Report - ${sdStr} to ${edStr}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };

  // Daily Summary
  sheet.addRow([]);
  const sumHeader = sheet.addRow(['Date', 'Total Meters', 'Defect Meters', 'Defect %']);
  sumHeader.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  const totalMeters = dailySummary.reduce((sum, d) => sum + d.total_meters, 0);
  const totalDefects = dailySummary.reduce((sum, d) => sum + d.total_defects, 0);

  dailySummary.forEach(day => {
    const pct = day.total_meters > 0 ? ((day.total_defects / day.total_meters) * 100).toFixed(1) + '%' : '0%';
    const row = sheet.addRow([day.date, day.total_meters, day.total_defects, pct]);
    row.eachCell((cell) => { cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; });
  });

  if (dailySummary.length === 0) {
    sheet.addRow(['No data for this week']);
  }

  // Detail section
  sheet.addRow([]);
  sheet.addRow(['Detailed Entries']).font = { bold: true, size: 12 };

  const detailHeader = sheet.addRow(['Date', 'Shift', 'Machine', 'Meters Produced', 'Defect Meters']);
  detailHeader.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  entries.forEach(entry => {
    const row = sheet.addRow([entry.date, entry.shift_name, entry.machine_name, entry.meters_produced, entry.defect_meters]);
    row.eachCell((cell) => { cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; });
  });

  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 15;
  sheet.getColumn(3).width = 20;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 15;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="weekly-report-${sdStr}-to-${edStr}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// GET - Monthly report
router.get('/monthly', requireAuth, requireRole('admin', 'supervisor'), (req, res) => {
  const { month, year } = req.query;
  const now = new Date();
  const reportMonth = month || String(now.getMonth() + 1).padStart(2, '0');
  const reportYear = year || now.getFullYear();

  const dailySummary = db.prepare(`
    SELECT date, 
           SUM(meters_produced) as total_meters,
           SUM(defect_meters) as total_defects
    FROM production_log
    WHERE strftime('%m', date) = ? AND strftime('%Y', date) = ?
    GROUP BY date
    ORDER BY date
  `).all(reportMonth, String(reportYear));

  const totalMeters = dailySummary.reduce((sum, d) => sum + d.total_meters, 0);
  const totalDefects = dailySummary.reduce((sum, d) => sum + d.total_defects, 0);
  const defectPct = totalMeters > 0 ? ((totalDefects / totalMeters) * 100).toFixed(1) : 0;

  res.render('reports/monthly', { dailySummary, totalMeters, totalDefects, defectPct, reportMonth, reportYear });
});

// GET - Export Monthly Report to Excel
router.get('/monthly/export', requireAuth, requireRole('admin', 'supervisor'), async (req, res) => {
  const { month, year } = req.query;
  const now = new Date();
  const reportMonth = month || String(now.getMonth() + 1).padStart(2, '0');
  const reportYear = year || now.getFullYear();

  const dailySummary = db.prepare(`
    SELECT date, 
           SUM(meters_produced) as total_meters,
           SUM(defect_meters) as total_defects
    FROM production_log
    WHERE strftime('%m', date) = ? AND strftime('%Y', date) = ?
    GROUP BY date
    ORDER BY date
  `).all(reportMonth, String(reportYear));

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[parseInt(reportMonth) - 1];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Production Tracker';
  const sheet = workbook.addWorksheet('Monthly Report');

  sheet.mergeCells('A1:D1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Monthly Production Report - ${monthName} ${reportYear}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };

  sheet.addRow([]);
  const headerRow = sheet.addRow(['Date', 'Total Meters', 'Defect Meters', 'Defect %']);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  const totalMeters = dailySummary.reduce((sum, d) => sum + d.total_meters, 0);
  const totalDefects = dailySummary.reduce((sum, d) => sum + d.total_defects, 0);

  dailySummary.forEach(day => {
    const pct = day.total_meters > 0 ? ((day.total_defects / day.total_meters) * 100).toFixed(1) + '%' : '0%';
    const row = sheet.addRow([day.date, day.total_meters, day.total_defects, pct]);
    row.eachCell((cell) => { cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; });
  });

  if (dailySummary.length === 0) {
    sheet.addRow(['No data for this month']);
  }

  sheet.addRow([]);
  const totalRow = sheet.addRow(['TOTAL', totalMeters, totalDefects, totalMeters > 0 ? ((totalDefects / totalMeters) * 100).toFixed(1) + '%' : '0%']);
  totalRow.eachCell((cell) => { cell.font = { bold: true }; });

  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 15;
  sheet.getColumn(4).width = 12;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="monthly-report-${monthName}-${reportYear}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// GET - Machine-wise report
router.get('/machine-wise', requireAuth, requireRole('admin', 'supervisor'), (req, res) => {
  const { machine_id, start_date, end_date } = req.query;
  const machines = db.prepare('SELECT * FROM machines ORDER BY machine_number').all();

  if (!machine_id) {
    return res.render('reports/machine-wise', { machines, selectedMachine: '', startDate: '', endDate: '', entries: [], summary: null, defectPct: 0 });
  }

  const sd = start_date || new Date().toISOString().split('T')[0];
  const ed = end_date || new Date().toISOString().split('T')[0];

  const entries = db.prepare(`
    SELECT pl.date, s.name as shift_name, pl.meters_produced, pl.defect_meters, pl.remarks
    FROM production_log pl
    JOIN shifts s ON pl.shift_id = s.id
    WHERE pl.machine_id = ? AND pl.date >= ? AND pl.date <= ?
    ORDER BY pl.date, s.name
  `).all(machine_id, sd, ed);

  const summary = db.prepare(`
    SELECT 
      COALESCE(SUM(meters_produced), 0) as total_meters,
      COALESCE(SUM(defect_meters), 0) as total_defects
    FROM production_log
    WHERE machine_id = ? AND date >= ? AND date <= ?
  `).get(machine_id, sd, ed);

  const defectPct = summary.total_meters > 0
    ? ((summary.total_defects / summary.total_meters) * 100).toFixed(1)
    : 0;

  res.render('reports/machine-wise', { machines, selectedMachine: machine_id, startDate: sd, endDate: ed, entries, summary, defectPct });
});

// GET - Export Machine-wise Report to Excel
router.get('/machine-wise/export', requireAuth, requireRole('admin', 'supervisor'), async (req, res) => {
  const { machine_id, start_date, end_date } = req.query;
  if (!machine_id) return res.redirect('/reports/machine-wise');

  const sd = start_date || new Date().toISOString().split('T')[0];
  const ed = end_date || new Date().toISOString().split('T')[0];

  const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(machine_id);
  const entries = db.prepare(`
    SELECT pl.date, s.name as shift_name, pl.meters_produced, pl.defect_meters, pl.remarks
    FROM production_log pl
    JOIN shifts s ON pl.shift_id = s.id
    WHERE pl.machine_id = ? AND pl.date >= ? AND pl.date <= ?
    ORDER BY pl.date, s.name
  `).all(machine_id, sd, ed);

  const summary = db.prepare(`
    SELECT 
      COALESCE(SUM(meters_produced), 0) as total_meters,
      COALESCE(SUM(defect_meters), 0) as total_defects
    FROM production_log
    WHERE machine_id = ? AND date >= ? AND date <= ?
  `).get(machine_id, sd, ed);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Production Tracker';
  const sheet = workbook.addWorksheet('Machine Report');

  sheet.mergeCells('A1:F1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Machine Report - ${machine ? machine.machine_name : 'Machine #' + machine_id} (${sd} to ${ed})`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };

  sheet.addRow([]);
  sheet.addRow(['Total Meters', summary.total_meters, 'Total Defects', summary.total_defects, 'Defect %', summary.total_meters > 0 ? ((summary.total_defects / summary.total_meters) * 100).toFixed(1) + '%' : '0%']);
  sheet.addRow([]);

  const headerRow = sheet.addRow(['Date', 'Shift', 'Meters Produced', 'Defect Meters', 'Defect %', 'Remarks']);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  entries.forEach(entry => {
    const pct = entry.meters_produced > 0 ? ((entry.defect_meters / entry.meters_produced) * 100).toFixed(1) + '%' : '0%';
    const row = sheet.addRow([entry.date, entry.shift_name, entry.meters_produced, entry.defect_meters, pct, entry.remarks || '-']);
    row.eachCell((cell) => { cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; });
  });

  if (entries.length === 0) {
    sheet.addRow(['No data for this machine in the selected date range']);
  }

  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 15;
  sheet.getColumn(3).width = 18;
  sheet.getColumn(4).width = 15;
  sheet.getColumn(5).width = 12;
  sheet.getColumn(6).width = 20;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="machine-${machine_id}-report-${sd}-to-${ed}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;