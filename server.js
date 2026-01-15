import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Ключи храним в памяти
let appId = process.env.APP_ID || null;
let appKey = process.env.APP_KEY || null;

// Главная страница — три ссылки
app.get('/', (req, res) => {
  res.send(`
    <h1>GOPS бэкенд ✈️</h1>
    <p><a href="/keys">Ввести ключи</a></p>
    <p><a href="/flightdata">Все полёты</a></p>
    <p><a href="/updates">Обновления</a></p>
  `);
});

// Страница ввода ключей
app.get('/keys', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Ключи DAA</title>
      <style>
        body { font-family: Arial; background: #f0f8ff; padding: 40px; text-align: center; }
        .box { max-width: 500px; margin: auto; background: white; padding: 30px; border-radius: 10px; }
        input { width: 100%; padding: 12px; margin: 10px 0; }
        button { padding: 15px 40px; background: #4CAF50; color: white; border: none; cursor: pointer; }
        #result { margin-top: 20px; padding: 15px; border: 1px solid #ccc; min-height: 80px; }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>Введи ключи DAA</h1>
        <form id="form">
          <input id="app_id" placeholder="app_id" required>
          <input id="app_key" placeholder="app_key" required>
          <button type="submit">Сохранить</button>
        </form>
        <div id="result">Жду...</div>
      </div>
      <script>
        const form = document.getElementById('form');
        const result = document.getElementById('result');
        form.addEventListener('submit', async e => {
          e.preventDefault();
          const id = document.getElementById('app_id').value.trim();
          const key = document.getElementById('app_key').value.trim();
          result.innerHTML = 'Сохраняю...';
          const res = await fetch('/save-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app_id: id, app_key: key })
          });
          const data = await res.json();
          if (data.success) {
            result.innerHTML = '<span style="color:green">Сохранено! Иди смотреть рейсы</span>';
          } else {
            result.innerHTML = '<span style="color:red">Ошибка: ' + data.error + '</span>';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Сохраняем ключи
app.post('/save-keys', (req, res) => {
  const { app_id, app_key } = req.body;
  if (!app_id || !app_key) {
    return res.json({ success: false, error: 'Введи оба поля' });
  }
  appId = app_id;
  appKey = app_key;
  res.json({ success: true });
});

// Все полёты
app.get('/flightdata', async (req, res) => {
  if (!appId || !appKey) {
    return res.status(400).json({ error: 'Нет ключей — зайди на /keys' });
  }

  try {
    const response = await axios.get(
      'https://api.daa.ie/dub/aops/flightdata/operational/v1/carrier/EI,BA,IB,VY,I2,AA,T2',
      {
        headers: {
          app_id: appId,
          app_key: appKey,
          Accept: 'application/json'
        },
        timeout: 60000  // 60 секунд — даём шанс большому ответу
      }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка запроса к DAA: ' + error.message });
  }
});

// Обновления
app.get('/updates', async (req, res) => {
  if (!appId || !appKey) {
    return res.status(400).json({ error: 'Нет ключей — зайди на /keys' });
  }

  try {
    const response = await axios.get(
      'https://api.daa.ie/dub/aops/flightdata/operational/v1/updates/carrier/EI,BA,IB,VY,I2,AA,T2',
      {
        headers: {
          app_id: appId,
          app_key: appKey,
          Accept: 'application/json'
        },
        timeout: 60000
      }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка запроса к DAA: ' + error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер на порту ${PORT}`);
});
