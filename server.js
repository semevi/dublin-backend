// server.js — с формой ввода ключей, если .env не работает

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

// Текущие ключи — сначала берём из .env
let currentAppId = process.env.APP_ID;
let currentAppKey = process.env.APP_KEY;

// Кэш данных
let cache = {
  flightdata: null,
  updates: null,
  lastUpdate: 0
};

// Проверяем ключи при запуске
console.log('Старт сервера...');
console.log('Ключи из .env: app_id =', currentAppId ? 'есть' : 'НЕТ', ', app_key =', currentAppKey ? 'есть' : 'НЕТ');

// Проверка, работают ли текущие ключи
async function testKeys(id, key) {
  try {
    const testUrl = 'https://api.daa.ie/dub/aops/flightdata/operational/v1/carrier/EI';
    await axios.get(testUrl, {
      headers: { app_id: id, app_key: key, Accept: 'application/json' },
      timeout: 8000
    });
    return true;
  } catch (e) {
    return false;
  }
}

// Если ключи из .env рабочие — сразу их используем
if (currentAppId && currentAppKey) {
  testKeys(currentAppId, currentAppKey).then(ok => {
    if (ok) console.log('Ключи из .env рабочие — супер!');
    else console.log('Ключи из .env НЕ работают — ждём ввода новых');
  });
}

// Главная страница
app.get('/', (req, res) => {
  const status = currentAppId && currentAppKey ? 'Ключи есть' : 'Ключи НЕТ — зайди на /keys';
  res.send(`
    <h1>GOPS бэкенд ✈️</h1>
    <p>Статус ключей: ${status}</p>
    <p><a href="/keys">Ввести/изменить app_id и app_key</a></p>
    <p><a href="/flightdata">Смотреть рейсы</a> | <a href="/updates">Смотреть обновления</a></p>
  `);
});

// Форма ввода ключей
app.get('/keys', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Ввод ключей DAA</title>
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
        <h1>Введи новые ключи DAA</h1>
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

          result.innerHTML = 'Проверяю...';

          const res = await fetch('/save-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app_id: id, app_key: key })
          });

          const data = await res.json();

          if (data.success) {
            result.innerHTML = '<span style="color:green">УСПЕХ! Ключи сохранены и работают</span><br>' +
              'Теперь можно смотреть рейсы';
          } else {
            result.innerHTML = '<span style="color:red">Ошибка: ' + data.error + '</span>';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Сохраняем новые ключи и проверяем их
app.post('/save-keys', (req, res) => {
  const { app_id, app_key } = req.body;

  if (!app_id || !app_key) {
    return res.json({ success: false, error: 'Введи оба поля' });
  }

  currentAppId = app_id;
  currentAppKey = app_key;

  // Обновляем заголовки
  DAA_HEADERS.app_id = app_id;
  DAA_HEADERS.app_key = app_key;

  console.log('Новые ключи сохранены:', app_id.substring(0,4) + '...');

  res.json({ success: true });
});

// Функция запроса к DAA
async function fetchDAA(endpoint) {
  if (!currentAppId || !currentAppKey) {
    throw new Error('Нет ключей — зайди на /keys и введи');
  }

  const response = await axios.get(
    `https://api.daa.ie/dub/aops/flightdata/operational/v1${endpoint}`,
    {
      headers: {
        app_id: currentAppId,
        app_key: currentAppKey,
        Accept: 'application/json'
      },
      timeout: 15000
    }
  );

  return response.data;
}

// Обновление кэша
async function updateCache() {
  try {
    cache.flightdata = await fetchDAA('/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.updates = await fetchDAA('/updates/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.lastUpdate = Date.now();
    console.log('Кэш обновлён');
  } catch (e) {
    console.error('Ошибка кэша:', e.message);
  }
}

setInterval(updateCache, 5 * 60 * 1000);
updateCache(); // первый запуск

// Рейсы и обновления
app.get('/flightdata', async (req, res) => {
  try {
    if (!cache.flightdata) await updateCache();
    res.json(cache.flightdata);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/updates', async (req, res) => {
  try {
    if (!cache.updates) await updateCache();
    res.json(cache.updates);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер на http://localhost:${PORT}`);
  console.log('Если ключи не работают — зайди на /keys');
});