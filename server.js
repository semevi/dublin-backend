// server.js — ключи из .env или через форму на старте
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

// Переменные для ключей (в памяти, пока сервер жив)
let appId = process.env.APP_ID;
let appKey = process.env.APP_KEY;

// Кэш — пока пустой, заполнится только когда ключи проверены
let cache = {
  flightdata: null,
  updates: null,
  lastUpdate: 0
};

// Функция теста ключей (та же, что была)
async function testKeys(id, key) {
  try {
    const testUrl = 'https://api.daa.ie/dub/aops/flightdata/operational/v1/carrier/EI';
    await axios.get(testUrl, {
      headers: { app_id: id, app_key: key, Accept: 'application/json' },
      timeout: 10000  // чуть больше, вдруг сеть медленная
    });
    return true;
  } catch (e) {
    console.error('Тест ключей провалился:', e.message);
    return false;
  }
}

// Функция запроса к API (теперь использует глобальные appId / appKey)
async function fetchDAA(endpoint) {
  if (!appId || !appKey) {
    throw new Error('Нет рабочих ключей — введи их на /keys');
  }
  const response = await axios.get(
    `https://api.daa.ie/dub/aops/flightdata/operational/v1${endpoint}`,
    {
      headers: {
        app_id: appId,
        app_key: appKey,
        Accept: 'application/json'
      },
      timeout: 15000
    }
  );
  return response.data;
}

// Обновление кэша — только если ключи есть
async function updateCache() {
  if (!appId || !appKey) return; // тихо пропускаем, если ключей нет

  try {
    cache.flightdata = await fetchDAA('/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.updates = await fetchDAA('/updates/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.lastUpdate = Date.now();
    console.log('Кэш обновлён успешно');
  } catch (e) {
    console.error('Ошибка обновления кэша:', e.message);
  }
}

// Проверяем ключи из .env при запуске
(async () => {
  console.log('Старт сервера...');
  if (appId && appKey) {
    const ok = await testKeys(appId, appKey);
    if (ok) {
      console.log('Ключи из .env — рабочие! Запускаем кэш.');
      updateCache(); // первый запуск
      setInterval(updateCache, 5 * 60 * 1000);
    } else {
      console.log('Ключи из .env НЕ работают — ждём ввода через /keys');
      appId = null;   // сбрасываем, чтобы заставить вводить
      appKey = null;
    }
  } else {
    console.log('Ключей в .env нет — открывай /keys в браузере');
  }
})();

// Главная страница — если ключей нет, сразу кидает на форму
app.get('/', (req, res) => {
  if (appId && appKey) {
    res.send(`
      <h1>GOPS бэкенд ✈️ — работает!</h1>
      <p>Ключи есть и проверены.</p>
      <p><a href="/flightdata">Смотреть рейсы</a> | <a href="/updates">Обновления</a></p>
      <p><a href="/keys">Сменить ключи</a></p>
    `);
  } else {
    res.redirect('/keys');  // самое важное — сразу на ввод!
  }
});

// Форма ввода ключей (красивая, как была)
app.get('/keys', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Ввод ключей DAA</title>
      <style>
        body { font-family: Arial; background: #f0f8ff; padding: 40px; text-align: center; }
        .box { max-width: 500px; margin: auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        input { width: 100%; padding: 12px; margin: 10px 0; box-sizing: border-box; font-size: 16px; }
        button { padding: 15px 40px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 18px; }
        #result { margin-top: 20px; padding: 15px; border: 1px solid #ccc; background: #fff; min-height: 80px; font-size: 16px; }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>Введи ключи от DAA API</h1>
        <form id="form">
          <input id="app_id" placeholder="app_id (например, 123abcde)" required>
          <input id="app_key" placeholder="app_key (длинный ключ)" required>
          <button type="submit">Проверить и сохранить</button>
        </form>
        <div id="result">Жду твои ключи...</div>
      </div>
      <script>
        const form = document.getElementById('form');
        const result = document.getElementById('result');
        form.addEventListener('submit', async e => {
          e.preventDefault();
          const id = document.getElementById('app_id').value.trim();
          const key = document.getElementById('app_key').value.trim();
          if (!id || !key) {
            result.innerHTML = '<span style="color:red">Заполни оба поля!</span>';
            return;
          }
          result.innerHTML = 'Проверяю ключи... подожди 5–10 секунд...';
          try {
            const res = await fetch('/save-keys', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ app_id: id, app_key: key })
            });
            const data = await res.json();
            if (data.success) {
              result.innerHTML = '<span style="color:green">УСПЕХ! Ключи рабочие!<br>Сейчас можно смотреть рейсы → <a href="/">На главную</a></span>';
            } else {
              result.innerHTML = '<span style="color:red">Ошибка: ' + (data.error || 'неизвестно') + '</span>';
            }
          } catch (err) {
            result.innerHTML = '<span style="color:red">Не смог соединиться с сервером</span>';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Сохранение и ПРОВЕРКА ключей
app.post('/save-keys', async (req, res) => {
  const { app_id, app_key } = req.body;
  if (!app_id || !app_key) {
    return res.json({ success: false, error: 'Оба поля обязательны' });
  }

  const ok = await testKeys(app_id, app_key);
  if (!ok) {
    return res.json({ success: false, error: 'Ключи НЕ работают (таймаут или ошибка авторизации)' });
  }

  // Сохраняем
  appId = app_id;
  appKey = app_key;

  console.log('Новые ключи сохранены и проверены!');
  updateCache(); // сразу запускаем кэш после успеха

  res.json({ success: true });
});

// Эндпоинты данных — только если ключи есть
app.get('/flightdata', async (req, res) => {
  try {
    if (!appId || !appKey) throw new Error('Нет ключей');
    if (!cache.flightdata) await updateCache();
    res.json(cache.flightdata || { message: 'Данные загружаются...' });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

app.get('/updates', async (req, res) => {
  try {
    if (!appId || !appKey) throw new Error('Нет ключей');
    if (!cache.updates) await updateCache();
    res.json(cache.updates || { message: 'Данные загружаются...' });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
  console.log('Если ключи не работают — браузер сам откроет /keys');
});
