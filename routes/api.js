const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const nodemailer = require('nodemailer');

// ─── User ────────────────────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  const u = req.user;
  res.json({ id: u.id, name: u.name, email: u.email, avatar: u.avatar, role: u.role, department: u.department });
});

router.put('/me', async (req, res) => {
  const { department } = req.body;
  try {
    const r = await pool.query(
      'UPDATE users SET department=$1 WHERE id=$2 RETURNING id,name,email,avatar,role,department',
      [department || '', req.user.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/users', async (req, res) => {
  try {
    const r = await pool.query('SELECT id,name,email,avatar,role,department,created_at FROM users ORDER BY created_at');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/users/:id/role', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '관리자만 권한을 변경할 수 있습니다.' });
  const { role } = req.body;
  if (!['admin', 'team_lead', 'member'].includes(role)) return res.status(400).json({ error: '잘못된 역할입니다.' });
  try {
    const r = await pool.query('UPDATE users SET role=$1 WHERE id=$2 RETURNING id,name,role', [role, req.params.id]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Events ──────────────────────────────────────────────────────────────────
router.get('/events', async (req, res) => {
  const { month, year } = req.query;
  try {
    let q = `SELECT e.*, u.name AS assigned_name FROM events e LEFT JOIN users u ON e.assigned_to=u.id`;
    const p = [];
    if (year && month) { q += ` WHERE EXTRACT(YEAR FROM e.date)=$1 AND EXTRACT(MONTH FROM e.date)=$2`; p.push(year, month); }
    q += ' ORDER BY e.date, e.id';
    const r = await pool.query(q, p);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/events', async (req, res) => {
  const { title, date, note, priority, assignedTo } = req.body;
  if (!title || !date) return res.status(400).json({ error: '제목과 날짜는 필수입니다.' });
  try {
    const r = await pool.query(
      'INSERT INTO events (created_by,assigned_to,title,date,note,priority) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.user.id, assignedTo || null, title, date, note || '', priority || 'mid']
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/events/:id', async (req, res) => {
  try {
    const isAdmin = ['admin', 'team_lead'].includes(req.user.role);
    await pool.query(
      isAdmin
        ? 'DELETE FROM events WHERE id=$1'
        : 'DELETE FROM events WHERE id=$1 AND created_by=$2',
      isAdmin ? [req.params.id] : [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Tasks ───────────────────────────────────────────────────────────────────
router.get('/tasks', async (req, res) => {
  try {
    const isPrivileged = ['admin', 'team_lead'].includes(req.user.role);
    const q = isPrivileged
      ? `SELECT t.*,u.name AS assigned_name,c.name AS creator_name FROM tasks t LEFT JOIN users u ON t.assigned_to=u.id LEFT JOIN users c ON t.created_by=c.id ORDER BY t.done,t.priority,t.due NULLS LAST`
      : `SELECT t.*,u.name AS assigned_name,c.name AS creator_name FROM tasks t LEFT JOIN users u ON t.assigned_to=u.id LEFT JOIN users c ON t.created_by=c.id WHERE t.assigned_to=$1 OR t.created_by=$1 ORDER BY t.done,t.priority,t.due NULLS LAST`;
    const r = await pool.query(q, isPrivileged ? [] : [req.user.id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tasks', async (req, res) => {
  const { title, due, priority, ownerName, assignedTo } = req.body;
  if (!title) return res.status(400).json({ error: '제목은 필수입니다.' });
  try {
    const r = await pool.query(
      'INSERT INTO tasks (created_by,assigned_to,title,due,priority,owner_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.user.id, assignedTo || null, title, due || null, priority || 'mid', ownerName || req.user.name]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/tasks/:id', async (req, res) => {
  const { done, title, priority, due, assignedTo, ownerName } = req.body;
  const fields = [], vals = [];
  let i = 1;
  if (done !== undefined) { fields.push(`done=$${i++}`); vals.push(done); }
  if (title !== undefined) { fields.push(`title=$${i++}`); vals.push(title); }
  if (priority !== undefined) { fields.push(`priority=$${i++}`); vals.push(priority); }
  if (due !== undefined) { fields.push(`due=$${i++}`); vals.push(due || null); }
  if (assignedTo !== undefined) { fields.push(`assigned_to=$${i++}`); vals.push(assignedTo || null); }
  if (ownerName !== undefined) { fields.push(`owner_name=$${i++}`); vals.push(ownerName); }
  if (!fields.length) return res.status(400).json({ error: '업데이트할 항목이 없습니다.' });
  vals.push(req.params.id);
  try {
    const r = await pool.query(`UPDATE tasks SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, vals);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Chat ────────────────────────────────────────────────────────────────────
router.get('/messages/:channel', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT m.*,u.name AS user_name,u.avatar AS user_avatar FROM chat_messages m LEFT JOIN users u ON m.user_id=u.id WHERE m.channel=$1 ORDER BY m.created_at DESC LIMIT 100`,
      [req.params.channel]
    );
    res.json(r.rows.reverse());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Post-its ────────────────────────────────────────────────────────────────
router.get('/postits', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM postits WHERE user_id=$1 ORDER BY created_at', [req.user.id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/postits', async (req, res) => {
  const { content, color, posX, posY } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO postits (user_id,content,color,pos_x,pos_y) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.user.id, content || '', color || '#fff3a3', posX || 80, posY || 80]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/postits/:id', async (req, res) => {
  const { content, color, posX, posY } = req.body;
  try {
    const r = await pool.query(
      `UPDATE postits SET
        content=COALESCE($1,content),
        color=COALESCE($2,color),
        pos_x=COALESCE($3,pos_x),
        pos_y=COALESCE($4,pos_y)
       WHERE id=$5 AND user_id=$6 RETURNING *`,
      [content, color, posX, posY, req.params.id, req.user.id]
    );
    res.json(r.rows[0] || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/postits/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM postits WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Assets ──────────────────────────────────────────────────────────────────
router.get('/assets', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM assets ORDER BY created_at');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/assets', async (req, res) => {
  const { name, qty, minQty, ownerName, status } = req.body;
  if (!name) return res.status(400).json({ error: '비품명은 필수입니다.' });
  try {
    const r = await pool.query(
      'INSERT INTO assets (name,qty,min_qty,owner_name,status) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, qty || 0, minQty || 0, ownerName || '', status || '정상']
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/assets/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM assets WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Trips ───────────────────────────────────────────────────────────────────
router.get('/trips', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT t.*,u.name AS user_name FROM trips t LEFT JOIN users u ON t.user_id=u.id ORDER BY t.created_at DESC'
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/trips', async (req, res) => {
  const { purpose, destination, startDate, endDate, status, memo } = req.body;
  if (!purpose) return res.status(400).json({ error: '출장 목적은 필수입니다.' });
  try {
    const r = await pool.query(
      'INSERT INTO trips (user_id,purpose,destination,start_date,end_date,status,memo) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.user.id, purpose, destination || '', startDate || null, endDate || null, status || '승인 대기', memo || '']
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/trips/:id', async (req, res) => {
  const { status } = req.body;
  try {
    const r = await pool.query('UPDATE trips SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/trips/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM trips WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Vacation ─────────────────────────────────────────────────────────────────
router.get('/vacation', async (req, res) => {
  try {
    await pool.query('INSERT INTO vacation (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [req.user.id]);
    const r = await pool.query('SELECT * FROM vacation WHERE user_id=$1', [req.user.id]);
    res.json(r.rows[0] || { total: 15, used: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/vacation', async (req, res) => {
  const { total, used } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO vacation (user_id,total,used) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET total=$2,used=$3 RETURNING *',
      [req.user.id, total || 0, used || 0]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Card Records ─────────────────────────────────────────────────────────────
router.get('/card-records', async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    let q = 'SELECT * FROM card_records WHERE user_id=$1', p = [req.user.id];
    if (startDate) { q += ` AND date>=$${p.length+1}`; p.push(startDate); }
    if (endDate) { q += ` AND date<=$${p.length+1}`; p.push(endDate); }
    q += ' ORDER BY date DESC';
    const r = await pool.query(q, p);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/card-records', async (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: 'records는 배열이어야 합니다.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM card_records WHERE user_id=$1', [req.user.id]);
    for (const r of records) {
      if (r.date && r.merchant && r.category && r.amount !== undefined) {
        await client.query(
          'INSERT INTO card_records (user_id,date,merchant,category,amount) VALUES ($1,$2,$3,$4,$5)',
          [req.user.id, r.date, r.merchant, r.category, Number(r.amount) || 0]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true, count: records.length });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ─── Ops Memo ─────────────────────────────────────────────────────────────────
router.get('/ops-memo', async (req, res) => {
  try {
    const r = await pool.query('SELECT content FROM ops_memo WHERE user_id=$1', [req.user.id]);
    res.json({ content: r.rows[0]?.content || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/ops-memo', async (req, res) => {
  try {
    const r = await pool.query(
      'INSERT INTO ops_memo (user_id,content) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET content=$2 RETURNING *',
      [req.user.id, req.body.content || '']
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Settlement Analytics ─────────────────────────────────────────────────────
router.get('/analytics/settlement', async (req, res) => {
  const { period = 'monthly', date } = req.query;
  try {
    const ref = date ? new Date(date) : new Date();
    let start, end;

    if (period === 'daily') {
      start = end = ref.toISOString().slice(0, 10);
    } else if (period === 'weekly') {
      const s = new Date(ref); s.setDate(ref.getDate() - ref.getDay());
      const e = new Date(s); e.setDate(s.getDate() + 6);
      start = s.toISOString().slice(0, 10); end = e.toISOString().slice(0, 10);
    } else if (period === 'monthly') {
      start = `${ref.getFullYear()}-${String(ref.getMonth()+1).padStart(2,'0')}-01`;
      end = new Date(ref.getFullYear(), ref.getMonth()+1, 0).toISOString().slice(0, 10);
    } else if (period === 'quarterly') {
      const q = Math.floor(ref.getMonth() / 3);
      start = `${ref.getFullYear()}-${String(q*3+1).padStart(2,'0')}-01`;
      end = new Date(ref.getFullYear(), q*3+3, 0).toISOString().slice(0, 10);
    } else {
      start = `${ref.getFullYear()}-01-01`;
      end = `${ref.getFullYear()}-12-31`;
    }

    const [evts, tsk, cards] = await Promise.all([
      pool.query('SELECT * FROM events WHERE date BETWEEN $1 AND $2', [start, end]),
      pool.query('SELECT * FROM tasks WHERE created_at::date BETWEEN $1 AND $2', [start, end]),
      pool.query('SELECT * FROM card_records WHERE user_id=$1 AND date BETWEEN $2 AND $3', [req.user.id, start, end])
    ]);

    const catMap = {}, daily = {};
    cards.rows.forEach(r => {
      catMap[r.category] = (catMap[r.category] || 0) + Number(r.amount);
      daily[r.date] = (daily[r.date] || 0) + Number(r.amount);
    });

    const total = cards.rows.reduce((a, b) => a + Number(b.amount), 0);
    const done = tsk.rows.filter(t => t.done).length;

    res.json({
      period, start, end,
      events: { total: evts.rows.length },
      tasks: { total: tsk.rows.length, completed: done, rate: tsk.rows.length ? Math.round(done / tsk.rows.length * 100) : 0 },
      spending: { total, avg: cards.rows.length ? Math.round(total / cards.rows.length) : 0, byCategory: catMap, daily }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Email ────────────────────────────────────────────────────────────────────
function makeTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
}

router.post('/email/test', async (req, res) => {
  const t = makeTransporter();
  if (!t) return res.status(400).json({ error: 'EMAIL_USER / EMAIL_PASS 환경변수를 설정하세요.' });
  try {
    await t.sendMail({
      from: `업무 대시보드 <${process.env.EMAIL_USER}>`,
      to: req.user.email,
      subject: '[테스트] 업무 대시보드 이메일 연결 확인',
      html: '<h2 style="color:#39b6b3">✅ 이메일 발송 성공!</h2><p>업무 대시보드에서 발송된 테스트 메일입니다.</p>'
    });
    res.json({ ok: true, to: req.user.email });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/email/daily-summary', async (req, res) => {
  const t = makeTransporter();
  if (!t) return res.status(400).json({ error: '이메일 설정이 필요합니다.' });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [evts, tsk] = await Promise.all([
      pool.query('SELECT * FROM events WHERE date=$1', [today]),
      pool.query('SELECT * FROM tasks WHERE done=false AND (due IS NULL OR due<=$1)', [today])
    ]);
    const html = `
      <div style="font-family:Pretendard,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f0fbfb;border-radius:16px">
        <h2 style="color:#39b6b3;margin:0 0 8px">📊 일일 업무 결산 — ${today}</h2>
        <p style="color:#6f8887;margin:0 0 20px">자동 발송된 업무 현황 요약입니다.</p>
        <h3 style="color:#274241">📅 오늘 일정 (${evts.rows.length}건)</h3>
        <ul style="padding-left:20px">${evts.rows.map(e=>`<li><b>${e.title}</b>${e.note?` — ${e.note}`:''}</li>`).join('')||'<li>오늘 일정이 없습니다</li>'}</ul>
        <h3 style="color:#274241">✅ 미완료 작업 (${tsk.rows.length}건)</h3>
        <ul style="padding-left:20px">${tsk.rows.map(t=>`<li>${t.title} <span style="color:#6f8887">(${t.due||'기한 없음'})</span></li>`).join('')||'<li>마감 임박 작업이 없습니다</li>'}</ul>
        <hr style="border:none;border-top:1px solid #d7eceb;margin:20px 0">
        <p style="color:#9eb2b1;font-size:12px">업무 대시보드 자동 발송 메일 · 수신 해제는 대시보드 설정에서</p>
      </div>`;
    await t.sendMail({
      from: `업무 대시보드 <${process.env.EMAIL_USER}>`,
      to: req.user.email,
      subject: `[일일결산] ${today} 업무 현황`,
      html
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
