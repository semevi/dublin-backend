// server.js — бэкенд для GOPS с вводом ключей DAA через форму
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

// Ключи храним здесь (в памяти сервера)
let currentAppId = process.env.APP_ID || null;
let currentAppKey = process.env.APP_KEY || null;

// Кэш данных рейсов
let cache = {
  flightdata: null,
  updates: null,
  lastUpdate: 0
};

// Функция проверки ключей — делает реальный запрос
async function testKeys(id, key) {
  try {
    console.log(`Тест ключей начат: ${new Date().toISOString()}`);
    const testUrl = 'https://api.daa.ie/dub/aops/flightdata/operational/v1/carrier/EI';
    const response = await axios.get(testUrl, {
      headers: {
        app_id: id,
        app_key: key,
        Accept: 'application/json'
      },
      timeout: 12000  // 12 секунд — даём шанс
    });
    console.log(`Тест успешен! Статус: ${response.status}`);
    return true;
  } catch (error) {
    console.error('Тест ключей НЕ удался:');
    console.error('Ошибка:', error.message);
    if (error.response) {
      console.error('Ответ от DAA API:', error.response.status, error.response.data || 'нет данных');
    } else if (error.request) {
      console.error('Запрос ушёл, но ответа нет — таймаут или блокировка');
    }
    return false;
  }
}

// Функция запроса к API DAA
async function fetchDAA(endpoint) {
  if (!currentAppId || !currentAppKey) {
    throw new Error('Нет ключей — зайди на /keys и введи их');
  }

  try {
    console.log(`Запрос к DAA: ${endpoint} — ${new Date().toISOString()}`);
    const response = await axios.get(
      `https://api.daa.ie/dub/aops/flightdata/operational/v1${endpoint}`,
      {
        headers: {
          app_id: currentAppId,
          app_key: currentAppKey,
          Accept: 'application/json'
        },
        timeout: 20000  // 20 секунд — на всякий случай
      }
    );
    console.log(`Успех: ${endpoint}`);
    return response.data;
  } catch (error) {
    console.error(`Ошибка в запросе ${endpoint}:`, error.message);
    if (error.response) {
      console.error('Статус от API:', error.response.status);
    }
    throw error;
  }
}

// Обновление кэша (запускаем каждые 5 минут)
async function updateCache() {
  if (!currentAppId || !currentAppKey) {
    console.log('Кэш не обновляем — нет ключей');
    return;
  }

  try {
    cache.flightdata = await fetchDAA('/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.updates = await fetchDAA('/updates/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.lastUpdate = Date.now();
    console.log('Кэш обновлён успешно');
  } catch (e) {
    console.error('Ошибка при обновлении кэша:', e.message);
  }
}

// Проверяем ключи из .env при запуске сервера
(async () => {
  console.log('Сервер стартует...');
  if (currentAppId && currentAppKey) {
    const isWorking = await testKeys(currentAppId, currentAppKey);
    if (isWorking) {
      console.log('Ключи из .env — рабочие! Запускаем кэш.');
      updateCache();                   // первый запуск
      setInterval(updateCache, 5 * 60 * 1000);  // каждые 5 минут
    } else {
      console.log('Ключи из .env НЕ работают — ждём ввода через форму');
      currentAppId = null;
      currentAppKey = null;
    }
  } else {
    console.log('В .env ключей нет — открывай браузер и заходи на /keys');
  }
})();

// Главная страница
app.get('/', (req, res) => {
  if (currentAppId && currentAppKey) {
    res.send(`
      <h1>GOPS бэкенд ✈️ — всё работает!</h1>
      <p>Ключи проверены и активны.</p>
      <p><a href="/flightdata">Посмотреть рейсы</a> | <a href="/updates">Обновления</a></p>
      <p><a href="/keys">Сменить ключи</a></p>
    `);
  } else {
    res.send(`
      <h1>GOPS бэкенд ✈️</h1>
      <p style="color: red; font-size: 20px;">Ключей нет или они не работают!</p>
      <p>Зайди сюда → <a href="/keys">Ввести ключи DAA</a></p>
    `);
  }
});

// Страница с формой ввода ключей
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
          result.innerHTML = 'Проверяю... подожди 5–15 секунд...';
          try {
            const res = await fetch('/save-keys', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ app_id: id, app_key: key })
            });
            const data = await res.json();
            if (data.success) {
              result.innerHTML = '<span style="color:green">УСПЕХ! Ключи рабочие!<br>Теперь можно смотреть рейсы → <a href="/">На главную</a></span>';
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

// Сохранение ключей + проверка
app.post('/save-keys', async (req, res) => {
  const { app_id, app_key } = req.body;

  if (!app_id || !app_key) {
    return res.json({ success: false, error: 'Оба поля обязательны' });
  }

  const isValid = await testKeys(app_id, app_key);

  if (!isValid) {
    return res.json({ success: false, error: 'Ключи не работают (таймаут, неверные данные или API лежит)' });
  }

  currentAppId = app_id;
  currentAppKey = app_key;

  console.log('Новые ключи сохранены и проверены успешно!');
  updateCache();  // сразу запускаем кэш

  res.json({ success: true });
});

// Эндпоинты для фронта
app.get('/flightdata', async (req, res) => {
  try {
    if (!cache.flightdata) await updateCache();
    res.json(cache.flightdata || { message: 'Данные ещё загружаются...' });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

app.get('/updates', async (req, res) => {
  try {
    if (!cache.updates) await updateCache();
    res.json(cache.updates || { message: 'Данные ещё загружаются...' });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log('Зайди в браузер: http://localhost:' + PORT + ' или на Render URL');
});
