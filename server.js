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

// Ключи храним в памяти — из .env или из формы
let currentAppId = process.env.APP_ID || null;
let currentAppKey = process.env.APP_KEY || null;

// Кэш данных — как коробка с игрушками
let cache = {
  flightdata: null,
  updates: null,
  lastUpdate: 0
};

// Функция, которая идёт в DAA только когда нужно (с ключами из памяти)
async function fetchDAA(endpoint) {
  if (!currentAppId || !currentAppKey) {
    throw new Error('Нет ключей — зайди на /keys и введи app_id и app_key');
  }

  console.log(`[FETCH] Иду в DAA за ${endpoint} с ключами... ${new Date().toISOString()}`);

  try {
    const response = await axios.get(
      `https://api.daa.ie/dub/aops/flightdata/operational/v1${endpoint}`,
      {
        headers: {
          app_id: currentAppId,
          app_key: currentAppKey,
          Accept: 'application/json'
        },
        timeout: 45000  // даём 45 секунд — вдруг медленно
      }
    );

    console.log(`[FETCH] Получил данные за ${endpoint} — супер!`);
    return response.data;
  } catch (error) {
    console.error(`[FETCH] Ошибка в ${endpoint}:`, error.message);
    if (error.response) {
      console.error('Статус от DAA:', error.response.status);
      if (error.response.status === 401 || error.response.status === 403) {
        throw new Error('Ключи неверные или просрочены (ошибка 401/403 от DAA)');
      }
    } else if (error.request) {
      console.error('Запрос ушёл, но ответа нет — таймаут или сеть');
      throw new Error('DAA не отвечает (таймаут) — попробуй позже или проверь интернет');
    }
    throw error;
  }
}

// Обновление кэша — вызывается только когда есть ключи и запрос успешен
async function updateCache() {
  if (!currentAppId || !currentAppKey) {
    console.log('[CACHE] Нет ключей — не обновляю');
    return;
  }

  try {
    cache.flightdata = await fetchDAA('/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.updates = await fetchDAA('/updates/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.lastUpdate = Date.now();
    console.log('[CACHE] Обновлён свежими данными');
  } catch (e) {
    console.error('[CACHE] Не получилось обновить:', e.message);
  }
}

// При запуске — ничего не проверяем, просто стартуем
console.log('Сервер запускается...');
if (currentAppId && currentAppKey) {
  console.log('Ключи из .env есть — кэш запустится при первом запросе');
} else {
  console.log('Ключей в .env нет — ждём ввода на /keys');
}

// Главная страница — если ключи есть, показываем ссылки
app.get('/', (req, res) => {
  if (currentAppId && currentAppKey) {
    res.send(`
      <h1>GOPS бэкенд ✈️ — работает!</h1>
      <p>Ключи сохранены.</p>
      <p><a href="/flightdata">Рейсы</a> | <a href="/updates">Обновления</a></p>
      <p><a href="/keys">Сменить ключи</a></p>
    `);
  } else {
    res.redirect('/keys');
  }
});

// Форма ввода ключей — теперь без проверки
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
          <button type="submit">Сохранить</button>
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
          result.innerHTML = 'Сохраняю...';
          const res = await fetch('/save-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app_id: id, app_key: key })
          });
          const data = await res.json();
          if (data.success) {
            result.innerHTML = '<span style="color:green">Сохранено! Теперь можно смотреть рейсы.<br><a href="/">На главную</a></span>';
          } else {
            result.innerHTML = '<span style="color:red">Ошибка: ' + (data.error || 'неизвестно') + '</span>';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Сохранение ключей — просто сохраняем, без теста
app.post('/save-keys', (req, res) => {
  const { app_id, app_key } = req.body;
  if (!app_id || !app_key) {
    return res.json({ success: false, error: 'Введи оба поля' });
  }

  currentAppId = app_id;
  currentAppKey = app_key;
  console.log('Новые ключи сохранены в память (проверка будет при запросе данных)');

  // Сразу пробуем обновить кэш — если ключи плохие, ошибка придёт сюда
  updateCache().catch(() => {});

  res.json({ success: true });
});

// Роуты данных — здесь ключи используются впервые
app.get('/flightdata', async (req, res) => {
  try {
    if (!cache.flightdata || Date.now() - cache.lastUpdate > 5 * 60 * 1000) {
      await updateCache();
    }
    if (!cache.flightdata) {
      return res.status(503).json({ error: 'Данные ещё загружаются... подожди 30–60 сек и обнови' });
    }
    res.json(cache.flightdata);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/updates', async (req, res) => {
  try {
    if (!cache.updates || Date.now() - cache.lastUpdate > 5 * 60 * 1000) {
      await updateCache();
    }
    if (!cache.updates) {
      return res.status(503).json({ error: 'Данные ещё загружаются... подожди 30–60 сек и обнови' });
    }
    res.json(cache.updates);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Будильник для Render — чтобы не спал
app.get('/ping', (req, res) => {
  res.send('pong ' + new Date().toISOString());
  console.log('[PING] Меня пинганули — не сплю!');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log('Зайди на /keys чтобы ввести ключи');
});
