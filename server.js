// server.js — теперь с рабочими ключами и кэшем

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan('dev'));     // логи в терминал
app.use(cors());            // фронт может стучаться откуда угодно
app.use(express.json());

// Показываем, что ключи есть
console.log('APP_ID:', process.env.APP_ID ? 'есть' : 'НЕТ!');
console.log('APP_KEY:', process.env.APP_KEY ? 'есть' : 'НЕТ!');

// Кэш — чтобы не долбить DAA каждую секунду
let cache = {
  flightdata: null,
  updates: null,
  lastUpdate: 0
};

// Заголовки — всегда эти два!
const DAA_HEADERS = {
  app_id: process.env.APP_ID,
  app_key: process.env.APP_KEY,
  Accept: 'application/json'  // на всякий случай, чтобы точно JSON
};

// Главная — чтобы не было Cannot GET /
app.get('/', (req, res) => {
  res.send(`
    <h1>GOPS бэкенд работает! ✈️</h1>
    <p>Проверь:</p>
    <ul>
      <li><a href="/health">/health</a></li>
      <li><a href="/flightdata">/flightdata</a> — все рейсы</li>
      <li><a href="/updates">/updates</a> — обновления</li>
    </ul>
  `);
});

// Проверка живости
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Сервер готов, ключи на месте' });
});

// Функция для запроса к DAA
async function fetchFromDAA(endpoint) {
  if (!process.env.APP_ID || !process.env.APP_KEY) {
    throw new Error('Нет app_id или app_key в .env');
  }

  console.log(`Запрашиваю DAA: ${endpoint}`);

  const response = await axios.get(
    `https://api.daa.ie/dub/aops/flightdata/operational/v1${endpoint}`,
    {
      headers: DAA_HEADERS,
      timeout: 15000
    }
  );

  console.log(`DAA ответил OK, статус: ${response.status}`);
  return response.data;
}

// Обновляем кэш каждые 5 минут
async function updateCache() {
  try {
    console.log('Обновляю кэш рейсов...');
    cache.flightdata = await fetchFromDAA('/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.updates   = await fetchFromDAA('/updates/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.lastUpdate = Date.now();
    console.log('Кэш обновлён!');
  } catch (error) {
    console.error('Ошибка обновления кэша:', error.message);
  }
}

// Запускаем авто-обновление каждые 5 минут
setInterval(updateCache, 5 * 60 * 1000); // 5 минут в миллисекундах

// Первый запуск — сразу загружаем
updateCache();

// GET /flightdata — отдаём из кэша или обновляем
app.get('/flightdata', async (req, res) => {
  try {
    if (!cache.flightdata) {
      await updateCache(); // если кэш пустой — обновляем сразу
    }
    res.json(cache.flightdata);
  } catch (error) {
    res.status(500).json({ error: 'Не удалось получить рейсы', details: error.message });
  }
});

// GET /updates
app.get('/updates', async (req, res) => {
  try {
    if (!cache.updates) {
      await updateCache();
    }
    res.json(cache.updates);
  } catch (error) {
    res.status(500).json({ error: 'Не удалось получить обновления', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
  console.log('Зайди и проверь:');
  console.log(`→ /flightdata`);
  console.log(`→ /updates`);
  console.log('Через 5 минут кэш обновится автоматически');
});
