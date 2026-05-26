require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { pool, initDB } = require('./db');
const authRouter = require('./routes/auth');
const apiRouter = require('./routes/api');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
  store: new pgSession({ pool, createTableIfMissing: false }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax'
  }
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// ─── Passport ────────────────────────────────────────────────────────────────
if (
  process.env.GOOGLE_CLIENT_ID &&
  !process.env.GOOGLE_CLIENT_ID.includes('YOUR_CLIENT')
) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/callback`
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      const name = profile.displayName;
      const avatar = profile.photos[0]?.value || null;
      const googleId = profile.id;

      const existing = await pool.query('SELECT * FROM users WHERE google_id=$1', [googleId]);
      if (existing.rows.length > 0) {
        const updated = await pool.query(
          'UPDATE users SET name=$1,avatar=$2 WHERE google_id=$3 RETURNING *',
          [name, avatar, googleId]
        );
        return done(null, updated.rows[0]);
      }

      const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
      const countResult = await pool.query('SELECT COUNT(*) FROM users');
      const isFirst = parseInt(countResult.rows[0].count) === 0;
      const role = isFirst || adminEmails.includes(email.toLowerCase()) ? 'admin' : 'member';

      const created = await pool.query(
        'INSERT INTO users (google_id,email,name,avatar,role) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [googleId, email, name, avatar, role]
      );
      await pool.query('INSERT INTO vacation (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [created.rows[0].id]);
      return done(null, created.rows[0]);
    } catch (err) {
      return done(err, null);
    }
  }));
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const r = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
    done(null, r.rows[0] || false);
  } catch (err) { done(err, null); }
});

// ─── Middleware ───────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/login.html');
}

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/api', requireAuth, apiRouter);

app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── Socket.io Chat ──────────────────────────────────────────────────────────
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

io.on('connection', async (socket) => {
  const userId = socket.request.session?.passport?.user;
  if (!userId) return socket.disconnect();

  const userResult = await pool.query('SELECT * FROM users WHERE id=$1', [userId]);
  const user = userResult.rows[0];
  if (!user) return socket.disconnect();

  socket.user = user;

  socket.on('join-channel', (channel) => {
    if (socket.currentChannel) socket.leave(socket.currentChannel);
    socket.join(channel);
    socket.currentChannel = channel;
  });

  socket.on('message', async ({ channel, text }) => {
    if (!text?.trim() || !channel) return;
    try {
      const r = await pool.query(
        'INSERT INTO chat_messages (user_id,channel,text) VALUES ($1,$2,$3) RETURNING id,created_at',
        [user.id, channel, text.trim()]
      );
      io.to(channel).emit('message', {
        id: r.rows[0].id,
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        channel,
        text: text.trim(),
        createdAt: r.rows[0].created_at
      });
    } catch (err) { console.error('Socket message error:', err.message); }
  });

  socket.on('typing', ({ channel }) => {
    socket.to(channel).emit('typing', { userName: user.name });
  });

  socket.on('disconnect', () => {});
});

// ─── Daily Email Cron ─────────────────────────────────────────────────────────
const cronTime = process.env.EMAIL_CRON || '0 17 * * *';
cron.schedule(cronTime, async () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [evts, tsk, admins] = await Promise.all([
      pool.query('SELECT e.*,u.name AS aname FROM events e LEFT JOIN users u ON e.assigned_to=u.id WHERE e.date=$1', [today]),
      pool.query('SELECT * FROM tasks WHERE done=false AND (due IS NULL OR due<=$1)', [today]),
      pool.query("SELECT email FROM users WHERE role='admin'")
    ]);
    if (!admins.rows.length) return;

    const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#39b6b3">📊 일일 업무 결산 — ${today}</h2>
        <h3>📅 오늘 일정 (${evts.rows.length}건)</h3>
        <ul>${evts.rows.map(e=>`<li><b>${e.title}</b>${e.aname?` (${e.aname})`:''}${e.note?` — ${e.note}`:''}</li>`).join('')||'<li>없음</li>'}</ul>
        <h3>✅ 미완료 작업 (${tsk.rows.length}건)</h3>
        <ul>${tsk.rows.map(t=>`<li>${t.title} (${t.due||'기한 없음'})</li>`).join('')||'<li>없음</li>'}</ul>
        <hr><p style="color:#9eb2b1;font-size:12px">업무 대시보드 자동 발송</p>
      </div>`;

    await t.sendMail({
      from: `업무 대시보드 <${process.env.EMAIL_USER}>`,
      to: admins.rows.map(a => a.email).join(','),
      subject: `[일일결산] ${today} 업무 현황`,
      html
    });
    console.log(`Daily summary sent to ${admins.rows.length} admin(s)`);
  } catch (err) { console.error('Cron email error:', err.message); }
}, { timezone: 'Asia/Seoul' });

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
initDB().then(() => {
  server.listen(PORT, () => console.log(`Dashboard running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
