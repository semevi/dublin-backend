import express from 'express';
import session from 'express-session';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Сессии — чтобы ключи не терялись при обновлении страницы
app.use(session({
  secret: 'super-secret-key-123',  // поменяй на свой длинный секрет
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }  // на Railway не нужен secure: true
}));

// Главная страница — форма + 3 кнопки
app.get('/', (req, res) => {
  const hasKeys = !!req.session.app_id;
  const keysInfo = hasKeys 
    ? `Ключи есть (App Key заканчивается на ...${req.session.app_key?.slice(-4) || ''})`
    : 'Ключи не введены — введи ниже';

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Flight Data DAA</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          background: #f0f2f5; 
          margin: 0; 
          padding: 20px; 
          text-align: center; 
        }
        .container { 
          max-width: 800px; 
          margin: auto; 
          background: white; 
          padding: 30px; 
          border-radius: 12px; 
          box-shadow: 0 4px 20px rgba(0,0,0,0.1); 
        }
        h1 { color: #333; }
        .status { 
          font-size: 18px; 
          margin: 20px 0; 
          padding: 12px; 
          border-radius: 8px; 
          background: ${hasKeys ? '#d4edda' : '#fff3cd'}; 
          color: ${hasKeys ? '#155724' : '#856404'}; 
        }
        input { 
          width: 100%; 
          padding: 12px; 
          margin: 10px 0; 
          border: 2px solid #ddd; 
          border-radius: 6px; 
          font-size: 16px; 
          box-sizing: border-box; 
        }
        button { 
          background: #667eea; 
          color: white; 
          border: none; 
          padding: 14px; 
          width: 100%; 
          margin: 10px 0; 
          border-radius: 6px; 
          font-size: 18px; 
          cursor: pointer; 
        }
        button:hover { background: #5a67d8; }
        .btn-group { 
          display: flex; 
          gap: 10px; 
          flex-wrap: wrap; 
          justify-content: center; 
          margin-top: 30px; 
        }
        .action-btn { 
          background: #48bb78; 
          padding: 16px 32px; 
          font-size: 18px; 
          min-width: 220px; 
        }
        .action-btn.updates { background: #4299e1; }
        #response { 
          margin-top: 30px; 
          padding: 20px; 
          background: #f7fafc; 
          border-radius: 8px; 
          white-space: pre-wrap; 
          text-align: left; 
          max-height: 500px; 
          overflow-y: auto; 
          display: none; 
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>✈️ DAA Flight Data</h1>
        
        <div class="status">${keysInfo}</div>
        
        <form action="/save-keys" method="POST">
          <input type="text" name="app_id" placeholder="App ID" value="${req.session.app_id || ''}" required>
          <input type="text" name="app_key" placeholder="App Key" value="${req.session.app_key || ''}" required>
          <button type="submit">Сохранить ключи</button>
        </form>

        <div class="btn-group">
          <button class="action-btn" onclick="getData('/flights')">Все рейсы</button>
          <button class="action-btn updates" onclick="getData('/updates')">Обновления</button>
        </div>

        <div id="response"></div>
      </div>

      <script>
        async function getData(endpoint) {
          const respDiv = document.getElementById('response');
          respDiv.innerHTML = 'Загружаю... подожди 10–60 секунд...';
          respDiv.style.display = 'block';

          try {
            const r = await fetch(endpoint);
            const data = await r.json();
            respDiv.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
          } catch (err) {
            respDiv.innerHTML = 'Ошибка: ' + err.message;
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Сохраняем ключи в сессию
app.post('/save-keys', (req, res) => {
  req.session.app_id = req.body.app_id?.trim();
  req.session.app_key = req.body.app_key?.trim();
  res.redirect('/');
});

// Все рейсы
app.get('/flights', async (req, res) => {
  if (!req.session.app_id || !req.session.app_key) {
    return res.status(401).json({ error: 'Нет ключей — вернись на главную и введи' });
  }

  try {
    const response = await fetch(
      'https://api.daa.ie/dub/aops/flightdata/operational/v1/carrier/EI,BA,IB,VY,I2,AA,T2',
      {
        headers: {
          app_id: req.session.app_id,
          app_key: req.session.app_key,
          Accept: 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`DAA ответил ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Обновления
app.get('/updates', async (req, res) => {
  if (!req.session.app_id || !req.session.app_key) {
    return res.status(401).json({ error: 'Нет ключей — вернись на главную и введи' });
  }

  try {
    const response = await fetch(
      'https://api.daa.ie/dub/aops/flightdata/operational/v1/updates/carrier/EI,BA,IB,VY,I2,AA,T2',
      {
        headers: {
          app_id: req.session.app_id,
          app_key: req.session.app_key,
          Accept: 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`DAA ответил ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер работает на порту ${PORT}`);
});
