import express from 'express';
import session from 'express-session';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Сессия — чтобы ключи помнились
app.use(session({
  secret: 'мой_очень_длинный_секрет_1234567890abcdef', // поменяй на свой
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 часа
}));

// Главная страница — всё здесь
app.get('/', (req, res) => {
  const hasKeys = !!req.session.app_id;
  const keyHint = hasKeys ? `App Key заканчивается на ...${req.session.app_key?.slice(-4) || ''}` : 'ключи не введены';

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DAA Рейсы</title>
      <style>
        body { font-family: Arial; background: #f0f2f5; margin: 0; padding: 20px; text-align: center; }
        .box { max-width: 700px; margin: auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        h1 { color: #333; }
        .status { font-size: 18px; padding: 12px; margin: 20px 0; border-radius: 8px; background: ${hasKeys ? '#d4edda' : '#fff3cd'}; color: ${hasKeys ? '#155724' : '#856404'}; }
        input { width: 100%; padding: 12px; margin: 10px 0; border: 2px solid #ddd; border-radius: 6px; font-size: 16px; box-sizing: border-box; }
        button { background: #667eea; color: white; border: none; padding: 14px; width: 100%; margin: 10px 0; border-radius: 6px; font-size: 18px; cursor: pointer; }
        button:hover { background: #5a67d8; }
        .btn-group { display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; margin: 30px 0; }
        .action-btn { background: #48bb78; padding: 16px 40px; font-size: 18px; border-radius: 8px; color: white; border: none; cursor: pointer; min-width: 200px; }
        .action-btn.updates { background: #4299e1; }
        #loading { margin-top: 20px; font-size: 18px; color: #666; display: none; }
        #response { margin-top: 20px; padding: 20px; background: #f7fafc; border-radius: 8px; white-space: pre-wrap; text-align: left; max-height: 500px; overflow-y: auto; display: none; }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>✈️ DAA Рейсы</h1>
        <div class="status">Статус: ${keyHint}</div>

        <form action="/save-keys" method="POST">
          <input type="text" name="app_id" placeholder="App ID" value="${req.session.app_id || ''}" required>
          <input type="text" name="app_key" placeholder="App Key" value="${req.session.app_key || ''}" required>
          <button type="submit">Сохранить ключи</button>
        </form>

        <div class="btn-group">
          <button class="action-btn" onclick="loadData('/flights')">Все рейсы</button>
          <button class="action-btn updates" onclick="loadData('/updates')">Обновления</button>
        </div>

        <div id="loading">Загружаю... подожди 20–60 секунд...</div>
        <div id="response"></div>
      </div>

      <script>
        async function loadData(url) {
          const loading = document.getElementById('loading');
          const resp = document.getElementById('response');
          loading.style.display = 'block';
          resp.style.display = 'none';
          resp.innerHTML = '';

          try {
            const r = await fetch(url);
            if (!r.ok) throw new Error('Ошибка: ' + r.status);
            const data = await r.json();
            resp.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
            resp.style.display = 'block';
          } catch (e) {
            resp.innerHTML = 'Ошибка: ' + e.message;
            resp.style.display = 'block';
          } finally {
            loading.style.display = 'none';
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Сохраняем ключи
app.post('/save-keys', (req, res) => {
  req.session.app_id = req.body.app_id?.trim();
  req.session.app_key = req.body.app_key?.trim();
  res.redirect('/');
});

// Рейсы
app.get('/flights', async (req, res) => {
  if (!req.session.app_id || !req.session.app_key) {
    return res.status(401).json({ error: 'Нет ключей' });
  }

  try {
    const r = await fetch(
      'https://api.daa.ie/dub/aops/flightdata/operational/v1/carrier/EI,BA,IB,VY,I2,AA,T2',
      {
        headers: {
          app_id: req.session.app_id,
          app_key: req.session.app_key,
          Accept: 'application/json'
        }
      }
    );

    if (!r.ok) throw new Error(`DAA: ${r.status}`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Обновления
app.get('/updates', async (req, res) => {
  if (!req.session.app_id || !req.session.app_key) {
    return res.status(401).json({ error: 'Нет ключей' });
  }

  try {
    const r = await fetch(
      'https://api.daa.ie/dub/aops/flightdata/operational/v1/updates/carrier/EI,BA,IB,VY,I2,AA,T2',
      {
        headers: {
          app_id: req.session.app_id,
          app_key: req.session.app_key,
          Accept: 'application/json'
        }
      }
    );

    if (!r.ok) throw new Error(`DAA: ${r.status}`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер работает на порту ${PORT}`);
});
