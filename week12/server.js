const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// Railway 환경변수 → HTML 플레이스홀더 치환 맵
const ENV_MAP = {
  '%%FIREBASE_API_KEY%%':             process.env.FIREBASE_API_KEY             || '',
  '%%FIREBASE_AUTH_DOMAIN%%':         process.env.FIREBASE_AUTH_DOMAIN         || '',
  '%%FIREBASE_PROJECT_ID%%':          process.env.FIREBASE_PROJECT_ID          || '',
  '%%FIREBASE_STORAGE_BUCKET%%':      process.env.FIREBASE_STORAGE_BUCKET      || '',
  '%%FIREBASE_MESSAGING_SENDER_ID%%': process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  '%%FIREBASE_APP_ID%%':              process.env.FIREBASE_APP_ID              || '',
  '%%EMAILJS_PUBLIC_KEY%%':           process.env.EMAILJS_PUBLIC_KEY           || '',
  '%%EMAILJS_SERVICE_ID%%':           process.env.EMAILJS_SERVICE_ID           || '',
  '%%EMAILJS_TEMPLATE_ID%%':          process.env.EMAILJS_TEMPLATE_ID          || '',
  '%%OPENAI_API_KEY%%':               process.env.OPENAI_API_KEY               || '',
};

const HTML_PATH = path.join(__dirname, '업무대시보드_김규홍.html');

// GET / → 환경변수가 주입된 HTML 반환
app.get('/', (req, res) => {
  let html = fs.readFileSync(HTML_PATH, 'utf8');
  for (const [placeholder, value] of Object.entries(ENV_MAP)) {
    html = html.split(placeholder).join(value);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// 정적 파일 (향후 이미지 등 추가 시 사용)
app.use(express.static(__dirname));

// 헬스체크 (Railway 배포 확인용)
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
  const configured = !!process.env.FIREBASE_API_KEY;
  console.log(`Firebase: ${configured ? '설정됨' : '미설정 (환경변수 필요)'}`);
});
