// server.js — ключи ТОЛЬКО из .env, никаких форм и ручного ввода
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Проверяем, что ключи вообще есть
const APP_ID = process.env.APP_ID;
const APP_KEY = process.env.APP_KEY;

if (!APP_ID || !APP_KEY) {
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('ОШИБКА: APP_ID и/или APP_KEY НЕ НАЙДЕНЫ В .env');
  console.error('Сервер НЕ ЗАПУСТИТСЯ без этих переменных');
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  process.exit(1); // сразу убиваем процесс — лучше так, чем работать без ключей
}

console.log('Ключи успешно прочитаны из .env');
console.log(`APP_ID  : ${APP_ID.substring(0, 6)}...`);
console.log(`APP_KEY : ${APP_KEY.substring(0, 6)}...`);

// Очень удобно для отладки — сразу видно, что ключи на месте

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

// Кэш данных
let cache = {
  flightdata: null,
  updates: null,
  lastUpdate: 0
};

// Заголовки — теперь константа, не меняется никогда
const DAA_HEADERS = {
  app_id: APP_ID,
  app_key: APP_KEY,
  Accept: 'application/json'
};

// Простая проверка, что ключи валидные (опционально, но полезно при старте)
async function testApiConnection() {
  try {
    const testUrl = 'https://api.daa.ie/dub/aops/flightdata/operational/v1/carrier/EI';
    await axios.get(testUrl, {
      headers: DAA_HEADERS,
      timeout: 8000
    });
    console.log('Тестовый запрос к DAA API → успех! Ключи рабочие.');
    return true;
  } catch (err) {
    console.error('Тестовый запрос НЕ удался:', err.message);
    if (err.response) {
      console.error('Ответ от сервера:', err.response.status, err.response.data);
    }
    return false;
  }
}

// Функция запроса к DAA (теперь использует фиксированные заголовки)
async function fetchDAA(endpoint) {
  const response = await axios.get(
    `https://api.daa.ie/dub/aops/flightdata/operational/v1${endpoint}`,
    {
      headers: DAA_HEADERS,
      timeout: 15000
    }
  );
  return response.data;
}

// Обновление кэша
async function updateCache() {
  try {
    cache.flightdata = await fetchDAA('/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.updates   = await fetchDAA('/updates/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.lastUpdate = Date.now();
    console.log(`Кэш обновлён: ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error('Ошибка при обновлении кэша:', err.message);
  }
}

// Запускаем первый раз + каждые 5 минут
updateCache();
setInterval(updateCache, 5 * 60 * 1000);

// Простая главная страница (для информации)
app.get('/', (req, res) => {
  res.send(`
    <h1>GOPS Backend ✈️</h1>
    <p>Ключи загружены из .env → всё ок</p>
    <p><a href="/flightdata">/flightdata</a> — рейсы</p>
    <p><a href="/updates">/updates</a> — обновления</p>
  `);
});

app.get('/flightdata', async (req, res) => {
  try {
    if (!cache.flightdata) await updateCache();
    res.json(cache.flightdata);
  } catch (err) {
    res.status(503).json({ error: 'Не удалось получить данные', details: err.message });
  }
});

app.get('/updates', async (req, res) => {
  try {
    if (!cache.updates) await updateCache();
    res.json(cache.updates);
  } catch (err) {
    res.status(503).json({ error: 'Не удалось получить обновления', details: err.message });
  }
});

app.listen(PORT, async () => {
  console.log(`Сервер запущен → http://localhost:${PORT}`);
  await testApiConnection(); // покажем сразу, живые ли ключи
});
