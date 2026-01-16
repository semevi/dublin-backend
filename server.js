// server.js — полный файл с базой данных и сохранением рейсов
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import axios from 'axios';
import { Pool } from 'pg';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

// Подключение к базе — как открыть дверь склада
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false  // на Mac обычно не нужен ssl
});

// Проверяем при запуске, что склад открыт
pool.query('SELECT NOW() AS now')
  .then(result => {
    console.log('Склад открыт! База работает. Время в базе:', result.rows[0].now);
  })
  .catch(err => {
    console.error('Дверь склада не открылась! Ошибка с базой:', err.message);
  });

// Ключи из .env
let currentAppId = process.env.APP_ID;
let currentAppKey = process.env.APP_KEY;

// Кэш — временная корзинка
let cache = {
  flightdata: null,
  updates: null,
  lastUpdate: 0
};

console.log('Старт сервера...');
console.log('Ключи из .env: app_id =', currentAppId ? 'есть' : 'НЕТ', ', app_key =', currentAppKey ? 'есть' : 'НЕТ');

// Проверка ключей
async function testKeys(id, key) {
  try {
    await axios.get('https://api.daa.ie/dub/aops/flightdata/operational/v1/carrier/EI', {
      headers: { app_id: id, app_key: key, Accept: 'application/json' },
      timeout: 8000
    });
    return true;
  } catch (e) {
    return false;
  }
}

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

// Форма для ключей
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

// Сохраняем новые ключи
app.post('/save-keys', (req, res) => {
  const { app_id, app_key } = req.body;

  if (!app_id || !app_key) {
    return res.json({ success: false, error: 'Введи оба поля' });
  }

  currentAppId = app_id;
  currentAppKey = app_key;

  console.log('Новые ключи сохранены:', app_id.substring(0,4) + '...');

  res.json({ success: true });
});

// Запрос к DAA
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

// Грузчик — кладёт рейсы на склад (в таблицу flights)
async function saveFlightsToDB(flightsArray) {
  if (!Array.isArray(flightsArray) || flightsArray.length === 0) {
    console.log('Нет рейсов — полка остаётся пустой');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const flight of flightsArray) {
      const fid = flight.FlightIdentification || {};
      const fdata = flight.FlightData || {};
      const fld = flight.Flight || {};
      const ops = flight.OperationalTimes || {};
      const load = flight.Load?.PassengerCounts || {};
      const agents = fld.HandlingAgents || [];

      const ramp = agents.find(a => a.HandlingAgentService === 'RAMP')?.HandlingAgentCode || null;
      const bag = agents.find(a => a.HandlingAgentService === 'BAG')?.HandlingAgentCode || null;

      await client.query(`
  INSERT INTO flights (
    flight_key, flight_identity, carrier_iata, flight_direction, scheduled_date_utc,
    scheduled_datetime, estimated_datetime, actual_on_blocks, actual_off_blocks,
    target_startup_approval, actual_startup_request, actual_startup_approval,
    estimated_airport_off_block, calculated_take_off, wheels_down, first_bag, last_bag,
    aircraft_registration, aircraft_type_icao, stand_position, gate_number,
    baggage_carousel_id, pax_total, flight_status_code, handling_ramp, handling_bag,
    origin_iata, origin_display, destination_iata, destination_display, code_share_status, mod_time, raw_json
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)
  ON CONFLICT (flight_key) DO UPDATE SET
    flight_identity = EXCLUDED.flight_identity,
    carrier_iata = EXCLUDED.carrier_iata,
    flight_direction = EXCLUDED.flight_direction,
    scheduled_date_utc = EXCLUDED.scheduled_date_utc,
    scheduled_datetime = EXCLUDED.scheduled_datetime,
    estimated_datetime = EXCLUDED.estimated_datetime,
    actual_on_blocks = EXCLUDED.actual_on_blocks,
    actual_off_blocks = EXCLUDED.actual_off_blocks,
    target_startup_approval = EXCLUDED.target_startup_approval,
    actual_startup_request = EXCLUDED.actual_startup_request,
    actual_startup_approval = EXCLUDED.actual_startup_approval,
    estimated_airport_off_block = EXCLUDED.estimated_airport_off_block,
    calculated_take_off = EXCLUDED.calculated_take_off,
    wheels_down = EXCLUDED.wheels_down,
    first_bag = EXCLUDED.first_bag,
    last_bag = EXCLUDED.last_bag,
    aircraft_registration = EXCLUDED.aircraft_registration,
    aircraft_type_icao = EXCLUDED.aircraft_type_icao,
    stand_position = EXCLUDED.stand_position,
    gate_number = EXCLUDED.gate_number,
    baggage_carousel_id = EXCLUDED.baggage_carousel_id,
    pax_total = EXCLUDED.pax_total,
    flight_status_code = EXCLUDED.flight_status_code,
    handling_ramp = EXCLUDED.handling_ramp,
    handling_bag = EXCLUDED.handling_bag,
    origin_iata = EXCLUDED.origin_iata,
    origin_display = EXCLUDED.origin_display,
    destination_iata = EXCLUDED.destination_iata,
    destination_display = EXCLUDED.destination_display,
    code_share_status = EXCLUDED.code_share_status,
    mod_time = EXCLUDED.mod_time,
    raw_json = EXCLUDED.raw_json,
    updated_at = NOW()
`, [
  fid.FlightKey,
  fid.FlightIdentity,
  fid.IATAFlightIdentifier?.CarrierIATACode,
  fid.FlightDirection,
  fid.ScheduledDateUTC ? fid.ScheduledDateUTC.split('T')[0] : null,
  ops.ScheduledDateTime,
  ops.EstimatedDateTime,
  ops.ActualOnBlocksDateTime,
  ops.ActualOffBlocksDateTime,
  ops.TargetStartupApprovalDateTime,
  ops.ActualStartUpRequestDateTime,
  ops.ActualStartUpApprovalDateTime,
  ops.EstimatedAirportOffBlockDateTime,
  flight.CDMInfoFields?.CalculatedTakeOffDateTime,
  ops.WheelsDownDateTime,
  ops.FirstBagDateTime,
  ops.LastBagDateTime,
  fdata.Aircraft?.AircraftRegistration,
  fdata.Aircraft?.AircraftTypeICAOCode,
  fdata.Airport?.Stand?.StandPosition,
  fdata.Airport?.Gate?.GateNumber,
  fdata.Airport?.BaggageReclaimCarousel?.BaggageReclaimCarouselID,
  load.TotalPassengerCount,
  fld.FlightStatusCode,
  ramp,
  bag,
  fld.OriginAirportIATACode,
  fld.OriginAirportDisplay || null,
  fld.DestinationAirportIATACode,
  fld.DestinationAirportDisplay || null,
  fld.CodeShareStatus,
  flight.ModTime,
  flight
]);
// Вот самое главное — проверка и запись истории стендов
const newStand = fdata.Airport?.Stand?.StandPosition || null;

// Получаем старый стенд из базы
const oldStandResult = await client.query(
  'SELECT stand_position FROM flights WHERE flight_key = $1',
  [fid.FlightKey]
);
const oldStand = oldStandResult.rows[0]?.stand_position || null;

// Если стенд изменился (или рейс новый) — пишем в историю
if (newStand && newStand !== oldStand) {
  await client.query(`
    INSERT INTO stand_history (
      flight_key, stand_position, assigned_at, source_mod_time, notes
    )
    VALUES ($1, $2, NOW(), $3, $4)
  `, [
    fid.FlightKey,
    newStand,
    flight.ModTime,
    oldStand 
      ? `Стенд сменили с ${oldStand} на ${newStand}` 
      : `Первый стенд назначен: ${newStand}`
  ]);

  console.log(`Стенд для ${fid.FlightIdentity} изменился: ${oldStand || 'нет'} → ${newStand}`);
}
    }

    await client.query('COMMIT');
    console.log(`Сохранили ${flightsArray.length} рейсов на склад!`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Грузчик уронил чемодан! Ошибка:', err.message);
  } finally {
    client.release();
  }
}

// Обновление кэша и склада
async function updateCache() {
  try {
    cache.flightdata = await fetchDAA('/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.updates = await fetchDAA('/updates/carrier/EI,BA,IB,VY,I2,AA,T2');

    if (cache.flightdata?.Flights && Array.isArray(cache.flightdata.Flights)) {
      await saveFlightsToDB(cache.flightdata.Flights);
    }

    cache.lastUpdate = Date.now();
    console.log('Кэш и склад обновлены');
  } catch (e) {
    console.error('Ошибка при обновлении:', e.message);
  }
}

setInterval(updateCache, 5 * 60 * 1000);
updateCache(); // первый запуск

// Показ рейсов и обновлений
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
// Самый простой эндпоинт: отдаём ВЕСЬ свежий JSON от DAA API
app.get('/api/raw-flights', async (req, res) => {
  try {
    // Если кэш пустой — обновляем его (тянем свежие данные из DAA)
    if (!cache.flightdata) {
      await updateCache();
    }

    // Просто отдаём весь JSON, который лежит в кэше
    if (cache.flightdata) {
      res.json(cache.flightdata);
    } else {
      res.status(503).json({ error: 'Данные ещё не загрузились, подожди 5–10 секунд' });
    }
  } catch (err) {
    console.error('Не смогли отдать сырой JSON:', err.message);
    res.status(500).json({ error: 'Что-то сломалось на складе' });
  }
});
app.listen(PORT, () => {
  console.log(`Сервер на http://localhost:${PORT}`);
  console.log('Если ключи не работают — зайди на /keys');
});
