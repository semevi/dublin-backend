// server.js — всё в одном файле, упрощённый и с отладкой

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

// Проверяем сразу при запуске — есть ли ключи
console.log('Проверка ключей:');
console.log('APP_ID:', process.env.APP_ID ? 'есть' : 'ОШИБКА: НЕТ APP_ID в .env');
console.log('APP_KEY:', process.env.APP_KEY ? 'есть' : 'ОШИБКА: НЕТ APP_KEY в .env');

// Главная страница — чтобы не было Cannot GET /
app.get('/', (req, res) => {
  res.send(`
    <h1>GOPS бэкенд живой! ✈️</h1>
    <p>Проверь:</p>
    <ul>
      <li><a href="/health">/health</a></li>
      <li><a href="/flightdata">/flightdata</a> — все рейсы</li>
      <li><a href="/updates">/updates</a> — дельта-обновления</li>
    </ul>
  `);
});

// Проверка сервера
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Сервер готов к разгрузке багажа' });
});

// Общие заголовки для DAA
const DAA_HEADERS = {
  app_id: process.env.APP_ID,
  app_key: process.env.APP_KEY
};

// Две ссылки — оставляем как есть, они правильные
const FLIGHTDATA_URL = 'https://api.daa.ie/dub/aops/flightdata/operational/v1/carrier/EI,BA,IB,VY,I2,AA,T2';
const UPDATES_URL   = 'https://api.daa.ie/dub/aops/flightdata/operational/v1/updates/carrier/EI,BA,IB,VY,I2,AA,T2';

// GET /flightdata
app.get('/flightdata', async (req, res) => {
  try {
    console.log('Кто-то попросил flightdata...');

    if (!process.env.APP_ID || !process.env.APP_KEY) {
      return res.status(400).json({ error: 'Нет APP_ID или APP_KEY в .env' });
    }

    const response = await axios.get(FLIGHTDATA_URL, {
      headers: DAA_HEADERS,
      timeout: 10000  // 10 секунд максимум
    });

    console.log('DAA ответил OK, статус:', response.status);
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка в flightdata:', error.message);

    if (error.response) {
      // DAA вернул ошибку — самая частая причина
      const status = error.response.status;
      const details = error.response.data || 'Нет деталей от DAA';

      console.error(`DAA статус: ${status}`, details);

      if (status === 401 || status === 403) {
        return res.status(401).json({
          error: 'Неверный APP_ID или APP_KEY',
          status,
          details
        });
      }
      if (status === 404) {
        return res.status(404).json({ error: 'Эндпоинт не найден', details });
      }

      res.status(status).json({ error: 'Ошибка от DAA', status, details });
    } else {
      res.status(500).json({
        error: 'Не удалось связаться с DAA',
        details: error.message
      });
    }
  }
});

// GET /updates — точно так же
app.get('/updates', async (req, res) => {
  try {
    console.log('Кто-то попросил updates...');

    if (!process.env.APP_ID || !process.env.APP_KEY) {
      return res.status(400).json({ error: 'Нет APP_ID или APP_KEY в .env' });
    }

    const response = await axios.get(UPDATES_URL, {
      headers: DAA_HEADERS,
      timeout: 10000
    });

    console.log('DAA ответил OK (updates), статус:', response.status);
    res.json(response.data);
  } catch (error) {
    // Тот же обработчик ошибок, что выше
    console.error('Ошибка в updates:', error.message);

    if (error.response) {
      const status = error.response.status;
      const details = error.response.data || 'Нет деталей';

      console.error(`DAA статус: ${status}`, details);

      if (status === 401 || status === 403) {
        return res.status(401).json({ error: 'Неверный APP_ID или APP_KEY', status, details });
      }
      res.status(status).json({ error: 'Ошибка от DAA (updates)', status, details });
    } else {
      res.status(500).json({ error: 'Не удалось связаться с DAA', details: error.message });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
  console.log('Зайди в браузер и проверь:');
  console.log('→ http://localhost:' + PORT + '/');
  console.log('→ http://localhost:' + PORT + '/health');
  console.log('→ http://localhost:' + PORT + '/flightdata');
  console.log('Смотри консоль — там будет всё, что происходит!');
});
