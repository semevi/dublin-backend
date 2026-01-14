// server.js — бэкенд для GOPS с вводом ключей DAA через форму
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;  // Render сам даёт свой порт, локально будет 3000

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

// Ключи храним в памяти сервера
let currentAppId = process.env.APP_ID || null;
let currentAppKey = process.env.APP_KEY || null;

// Кэш данных
let cache = {
  flightdata: null,
  updates: null,
  lastUpdate: 0
};

// Проверка ключей — реальный запрос к API
async function testKeys(id, key) {
  try {
    console.log(`[TEST] Проверяю ключи... ${new Date().toISOString()}`);
    const testUrl = 'https://api.daa.ie/dub/aops/flightdata/operational/v1/carrier/EI';
    await axios.get(testUrl, {
      headers: { app_id: id, app_key: key, Accept: 'application/json' },
      timeout: 15000
    });
    console.log('[TEST] Ключи рабочие!');
    return true;
  } catch (error) {
    console.error('[TEST] Ошибка проверки ключей:');
    console.error('Сообщение:', error.message);
    if (error.response) {
      console.error('Статус от сервера DAA:', error.response.status);
      console.error('Данные ответа:', error.response.data || 'нет данных');
    } else if (error.request) {
      console.error('Запрос ушёл, ответа нет — таймаут или блокировка');
    }
    return false;
  }
}

// Запрос к API DAA
async function fetchDAA(endpoint) {
  if (!currentAppId || !currentAppKey) {
    throw new Error('Нет ключей — зайди на /keys');
  }

  try {
    console.log(`[FETCH] Запрос: ${endpoint} — ${new Date().toISOString()}`);
    const response = await axios.get(
      `https://api.daa.ie/dub/aops/flightdata/operational/v1${endpoint}`,
      {
        headers: {
          app_id: currentAppId,
          app_key: currentAppKey,
          Accept: 'application/json'
        },
        timeout: 30000  // 30 секунд — даём шанс, если медленно
      }
    );
    console.log(`[FETCH] Успех: ${endpoint}`);
    return response.data;
  } catch (error) {
    console.error(`[FETCH] Ошибка в ${endpoint}:`, error.message);
    if (error.response) {
      console.error('Статус:', error.response.status);
    }
    throw error;
  }
}

// Обновление кэша каждые 5 минут
async function updateCache() {
  if (!currentAppId || !currentAppKey) {
    console.log('[CACHE] Нет ключей — пропускаем обновление');
    return;
  }

  try {
    cache.flightdata = await fetchDAA('/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.updates = await fetchDAA('/updates/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.lastUpdate = Date.now();
    console.log('[CACHE] Обновлён успешно');
  } catch (e) {
    console.error('[CACHE] Ошибка обновления:', e.message);
  }
}

// Проверяем ключи из .env при запуске
(async () => {
  console.log('Сервер запускается...');
  if (currentAppId && currentAppKey) {
    const ok = await testKeys(currentAppId, currentAppKey);
    if (ok) {
      console.log('Ключи из .env ОК — запускаем кэш');
      updateCache();
      setInterval(updateCache, 5 * 60 * 1000);
    } else {
      console.log('Ключи из .env НЕ работают — ждём форму /keys');
      currentAppId = null;
      currentAppKey = null;
    }
  } else {
    console.log('В .env ключей нет — заходи на /keys');
  }
})();

// Главная страница
app.get('/', (req, res) => {
  if (currentAppId && currentAppKey) {
    res.send(`
      <h1>GOPS бэкенд ✈️ — работает!</h1>
      <p>Ключи есть и проверены.</p>
      <p><a href="/flightdata">Рейсы</a> | <a href="/updates">Обновления</a></p>
      <p><a href="/keys">Сменить ключи</a></p>
    `);
  } else {
    res.redirect('/keys');
  }
});

// Форма ввода ключей
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
        input { width: 100%; padding: 12px; margin: 10px 0; box-sizing: border-box; }
        button { padding: 15px 40px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; }
        #result { margin-top: 20px; padding: 15px; border: 1px solid #ccc; background: #fff; min-height: 100px; }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>Введи ключи DAA</h1>
        <form id="form">
          <input id="app_id" placeholder="app_id" required>
          <input id="app_key" placeholder="app_key" required>
          <button type="submit">Сохранить и проверить</button>
        </form>
        <div id="result">Жду ввода...</div>
      </div>
      <script>
        const form = document.getElementById('form');
        const result = document.getElementById('result');
        form.addEventListener('submit', async e => {
          e.preventDefault();
          const id = document.getElementById('app_id').value.trim();
          const key = document.getElementById('app_key').value.trim();
          result.innerHTML = 'Проверяю... подожди 10-20 сек...';
          const res = await fetch('/save-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app_id: id, app_key: key })
          });
          const data = await res.json();
          if (data.success) {
            result.innerHTML = '<span style="color:green">УСПЕХ! Ключи работают!<br><a href="/">На главную</a></span>';
          } else {
            result.innerHTML = '<span style="color:red">Ошибка: ' + (data.error || 'неизвестно') + '</span>';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Сохранение ключей + проверка
app.post('/save-keys', async (req, res) => {
  const { app_id, app_key } = req.body;
  if (!app_id || !app_key) {
    return res.json({ success: false, error: 'Введи оба поля' });
  }

  const ok = await testKeys(app_id, app_key);
  if (!ok) {
    return res.json({ success: false, error: 'Ключи НЕ работают (таймаут или ошибка авторизации)' });
  }

  currentAppId = app_id;
  currentAppKey = app_key;

  console.log('Новые ключи сохранены и проверены!');
  updateCache();  // сразу запускаем

  res.json({ success: true });
});

// Эндпоинты данных
app.get('/flightdata', async (req, res) => {
  try {
    if (!cache.flightdata) await updateCache();
    res.json(cache.flightdata || { message: 'Данные загружаются...' });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

app.get('/updates', async (req, res) => {
  try {
    if (!cache.updates) await updateCache();
    res.json(cache.updates || { message: 'Данные загружаются...' });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

// Запуск сервера — правильно для Render
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log('Если ключи не работают — заходи на /keys');
});
