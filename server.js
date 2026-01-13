import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import axios from 'axios';
import cron from 'node-cron';

dotenv.config(); // загружаем .env

const app = express();
const PORT = process.env.PORT || 3000;

// Логируем все запросы — видно, кто и когда пришёл
app.use(morgan('dev'));

// Разрешаем фронту с любого домена стучаться
app.use(cors());

// Читаем JSON, если кто-то пришлёт
app.use(express.json());

// Кэш — просто объект в памяти, как коробка под сиденьем
let cache = {
  flightdata: null,
  updates: null,
  lastUpdate: 0 // когда последний раз обновляли
};

// Базовый адрес DAA API
const BASE_URL = 'https://api.daa.ie/dub/aops/flightdata/operational/v1';

// Заголовки для аутентификации — берём из .env
const headers = {
  app_id: process.env.APP_ID,
  app_key: process.env.APP_KEY
};

// Функция, которая ездит за данными
async function fetchData(endpoint) {
  try {
    const response = await axios.get(`${BASE_URL}${endpoint}`, { headers });
    return response.data;
  } catch (error) {
    console.error(`Ошибка при запросе ${endpoint}:`, error.message);
    throw error;
  }
}

// Обновляем кэш (вызываем раз в 5 минут)
async function updateCache() {
  try {
    console.log('Обновляю кэш...');

    cache.flightdata = await fetchData('/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.updates = await fetchData('/updates/carrier/EI,BA,IB,VY,I2,AA,T2');

    cache.lastUpdate = Date.now();
    console.log('Кэш обновлён успешно!');
  } catch (error) {
    console.error('Не удалось обновить кэш:', error);
  }
}

// Запускаем обновление каждые 5 минут (cron: */5 * * * *)
cron.schedule('*/5 * * * *', updateCache);

// Первый запуск — сразу обновляем, чтобы не ждать 5 минут
updateCache();

// Проверка, что сервер живой
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Сервер работает, данные о рейсах на подходе' });
});

// Отдаём кэшированные данные flightdata
app.get('/flightdata', (req, res) => {
  if (!cache.flightdata) {
    return res.status(503).json({ error: 'Данные ещё загружаются, подожди 10–30 секунд' });
  }
  res.json(cache.flightdata);
});

// Отдаём кэшированные updates
app.get('/updates', (req, res) => {
  if (!cache.updates) {
    return res.status(503).json({ error: 'Данные ещё загружаются, подожди 10–30 секунд' });
  }
  res.json(cache.updates);
});

// Если ошибка — показываем красиво
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Что-то сломалось на сервере' });
});

// Запускаем сервер
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log('Проверь: http://localhost:3000/health');
  console.log('Данные: http://localhost:3000/flightdata и http://localhost:3000/updates');
});
