// server.js — весь бэкенд в одном файле, простой как трактор для пушбэка

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config(); // читаем .env

const app = express();
const PORT = process.env.PORT || 3000;

// Логируем все запросы — видно в терминале, кто и куда стучится
app.use(morgan('dev'));

// Разрешаем фронту с любого места (Vercel, localhost и т.д.)
app.use(cors());

// Читаем JSON, если кто-то пришлёт
app.use(express.json());

// Проверяем, что ключи вообще есть
console.log('APP_ID из .env:', process.env.APP_ID ? 'есть' : 'НЕТ APP_ID!!!');
console.log('APP_KEY из .env:', process.env.APP_KEY ? 'есть' : 'НЕТ APP_KEY!!!');

// Главная страница — чтобы не было Cannot GET /
app.get('/', (req, res) => {
  res.send(`
    <h1>GOPS бэкенд работает!</h1>
    <p>Проверь эти ссылки:</p>
    <ul>
      <li><a href="/health">/health</a> — проверка сервера</li>
      <li><a href="/flightdata">/flightdata</a> — все рейсы</li>
      <li><a href="/updates">/updates</a> — обновления</li>
    </ul>
    <p>Если ошибка — смотри консоль терминала!</p>
  `);
});

// Проверка, что сервер живой
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Сервер работает, готов тянуть рейсы EI, BA и остальных',
    time: new Date().toISOString()
  });
});

// Функция для запроса к DAA — общая для обоих эндпоинтов
async function fetchFromDAA(endpoint) {
  console.log(`Запрашиваю DAA: ${endpoint}`);

  if (!process.env.APP_ID || !process.env.APP_KEY) {
    throw new Error('Нет APP_ID или APP_KEY в .env');
  }

  const response = await axios.get(
    `https://api.daa.ie/dub/aops/flightdata/operational/v1${endpoint}`,
    {
      headers: {
        app_id: process.env.APP_ID,
        app_key: process.env.APP_KEY
      },
      timeout: 15000 // 15 секунд максимум, чтобы не висеть вечно
    }
  );

  console.log(`Получил ответ от DAA, статус: ${response.status}`);
  return response.data;
}

// GET /flightdata — полный список рейсов
app.get('/flightdata', async (req, res) => {
  try {
    const data = await fetchFromDAA('/carrier/EI,BA,IB,VY,I2,AA,T2');
    res.json(data);
  } catch (error) {
    console.error('Ошибка в /flightdata:', error.message);

    if (error.response) {
      // DAA ответил с ошибкой (самая частая причина)
      console.error('Статус от DAA:', error.response.status);
      console.error('Что ответил DAA:', error.response.data);
      res.status(error.response.status).json({
        error: 'Ошибка от DAA API',
        status: error.response.status,
        message: error.response.data?.message || error.message
      });
    } else if (error.request) {
      // Запрос ушёл, но ответа нет (сеть, таймаут, блокировка)
      res.status(504).json({ error: 'Нет ответа от DAA API (таймаут или сеть)' });
    } else {
      // Другая ошибка (например, нет ключей)
      res.status(500).json({ error: 'Внутренняя ошибка сервера', details: error.message });
    }
  }
});

// GET /updates — обновления
app.get('/updates', async (req, res) => {
  try {
    const data = await fetchFromDAA('/updates/carrier/EI,BA,IB,VY,I2,AA,T2');
    res.json(data);
  } catch (error) {
    console.error('Ошибка в /updates:', error.message);

    if (error.response) {
      console.error('Статус от DAA:', error.response.status);
      console.error('Что ответил DAA:', error.response.data);
      res.status(error.response.status).json({
        error: 'Ошибка от DAA API (updates)',
        status: error.response.status,
        message: error.response.data?.message || error.message
      });
    } else if (error.request) {
      res.status(504).json({ error: 'Нет ответа от DAA API (updates)' });
    } else {
      res.status(500).json({ error: 'Внутренняя ошибка', details: error.message });
    }
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log('Проверь в браузере:');
  console.log(`http://localhost:${PORT}/`);
  console.log(`http://localhost:${PORT}/health`);
  console.log(`http://localhost:${PORT}/flightdata`);
  console.log(`http://localhost:${PORT}/updates`);
  console.log('Смотри консоль — там будут все ошибки и что происходит!');
});
