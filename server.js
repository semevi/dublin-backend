import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import axios from 'axios';
import { Pool } from 'pg';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 30000;

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection on startup
pool.query('SELECT NOW()').then(res => {
  console.log('Database connected successfully at:', res.rows[0].now);
}).catch(err => {
  console.error('Database connection failed:', err.message);
});

// Permanent DAA API credentials from .env
const APP_ID = process.env.APP_ID;
const APP_KEY = process.env.APP_KEY;

if (!APP_ID || !APP_KEY) {
  console.error('FATAL: APP_ID or APP_KEY missing in .env file!');
  process.exit(1);
}

// In-memory cache for flight data
let cache = {
  flightdata: null,
  updates: null,
  lastUpdate: 0
};

// Fetch data from DAA AOPS API
async function fetchFromDAA(endpoint) {
  const response = await axios.get(
    `https://api.daa.ie/dub/aops/flightdata/operational/v1${endpoint}`,
    {
      headers: {
        app_id: APP_ID,
        app_key: APP_KEY,
        Accept: 'application/json'
      },
      timeout: 15000
    }
  );
  return response.data;
}

// Save or update flights in PostgreSQL (UPSERT with conflict on flight_key)
async function saveFlightsToDB(flightsArray) {
  if (!Array.isArray(flightsArray) || flightsArray.length === 0) {
    console.log('No flights to process');
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

      const rampAgent = agents.find(a => a.HandlingAgentService === 'RAMP')?.HandlingAgentCode || null;
      const bagAgent = agents.find(a => a.HandlingAgentService === 'BAG')?.HandlingAgentCode || null;

      await client.query(`
        INSERT INTO flights (
          flight_key, flight_identity, carrier_iata, flight_direction, scheduled_date_utc,
          scheduled_datetime, estimated_datetime, actual_on_blocks, actual_off_blocks,
          target_startup_approval, actual_startup_request, actual_startup_approval,
          estimated_airport_off_block, calculated_take_off, wheels_down, first_bag, last_bag,
          aircraft_registration, aircraft_type_icao, stand_position, gate_number,
          baggage_carousel_id, pax_total, flight_status_code, handling_ramp, handling_bag,
          origin_iata, origin_display, destination_iata, destination_display,
          code_share_status, mod_time, raw_json
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33
        )
        ON CONFLICT (flight_key) DO UPDATE SET
          flight_identity         = EXCLUDED.flight_identity,
          carrier_iata            = EXCLUDED.carrier_iata,
          flight_direction        = EXCLUDED.flight_direction,
          scheduled_date_utc      = EXCLUDED.scheduled_date_utc,
          scheduled_datetime      = EXCLUDED.scheduled_datetime,
          estimated_datetime      = EXCLUDED.estimated_datetime,
          actual_on_blocks        = EXCLUDED.actual_on_blocks,
          actual_off_blocks       = EXCLUDED.actual_off_blocks,
          target_startup_approval = EXCLUDED.target_startup_approval,
          actual_startup_request  = EXCLUDED.actual_startup_request,
          actual_startup_approval = EXCLUDED.actual_startup_approval,
          estimated_airport_off_block = EXCLUDED.estimated_airport_off_block,
          calculated_take_off     = EXCLUDED.calculated_take_off,
          wheels_down             = EXCLUDED.wheels_down,
          first_bag               = EXCLUDED.first_bag,
          last_bag                = EXCLUDED.last_bag,
          aircraft_registration   = EXCLUDED.aircraft_registration,
          aircraft_type_icao      = EXCLUDED.aircraft_type_icao,
          stand_position          = EXCLUDED.stand_position,
          gate_number             = EXCLUDED.gate_number,
          baggage_carousel_id     = EXCLUDED.baggage_carousel_id,
          pax_total               = EXCLUDED.pax_total,
          flight_status_code      = EXCLUDED.flight_status_code,
          handling_ramp           = EXCLUDED.handling_ramp,
          handling_bag            = EXCLUDED.handling_bag,
          origin_iata             = EXCLUDED.origin_iata,
          origin_display          = EXCLUDED.origin_display,
          destination_iata        = EXCLUDED.destination_iata,
          destination_display     = EXCLUDED.destination_display,
          code_share_status       = EXCLUDED.code_share_status,
          mod_time                = EXCLUDED.mod_time,
          raw_json                = EXCLUDED.raw_json,
          updated_at              = NOW()
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
        rampAgent,
        bagAgent,
        fld.OriginAirportIATACode,
        fld.OriginAirportDisplay || null,
        fld.DestinationAirportIATACode,
        fld.DestinationAirportDisplay || null,
        fld.CodeShareStatus,
        flight.ModTime,
        flight  // full raw JSON object for auditing
      ]);

      // Detect and log stand position changes
      const newStand = fdata.Airport?.Stand?.StandPosition || null;
      const { rows } = await client.query(
        'SELECT stand_position FROM flights WHERE flight_key = $1',
        [fid.FlightKey]
      );
      const oldStand = rows[0]?.stand_position || null;

      if (newStand && newStand !== oldStand) {
        await client.query(`
          INSERT INTO stand_history (
            flight_key, stand_position, assigned_at, source_mod_time, notes
          ) VALUES ($1, $2, NOW(), $3, $4)
        `, [
          fid.FlightKey,
          newStand,
          flight.ModTime,
          oldStand
            ? `Stand changed from ${oldStand} to ${newStand}`
            : `Initial stand assigned: ${newStand}`
        ]);
        console.log(`Stand updated for flight ${fid.FlightIdentity}: ${oldStand || 'none'} → ${newStand}`);
      }
    }

    await client.query('COMMIT');
    console.log(`Successfully saved/updated ${flightsArray.length} flights`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Database transaction failed:', err.message, err.stack);
  } finally {
    client.release();
  }
}

// Update cache and database from DAA API
async function updateCache() {
  try {
    cache.flightdata = await fetchFromDAA('/carrier/EI,BA,IB,VY,I2,AA,T2');
    cache.updates = await fetchFromDAA('/updates/carrier/EI,BA,IB,VY,I2,AA,T2');

    if (cache.flightdata?.Flights?.length > 0) {
      await saveFlightsToDB(cache.flightdata.Flights);
    }

    cache.lastUpdate = Date.now();
    console.log('Cache and database updated from DAA API');
  } catch (err) {
    console.error('Failed to update from DAA:', err.message);
  }
}

// Initial fetch + periodic updates (every 5 minutes)
updateCache();
setInterval(updateCache, 5 * 60 * 1000);

// Public API endpoints
app.get('/api/raw-flights', async (req, res) => {
  if (!cache.flightdata) await updateCache();
  res.json(cache.flightdata || { Flights: [] });
});

app.get('/api/updates', async (req, res) => {
  if (!cache.updates) await updateCache();
  res.json(cache.updates || {});
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    lastUpdate: new Date(cache.lastUpdate).toISOString(),
    flightsInCache: cache.flightdata?.Flights?.length || 0
  });
});

// Root redirect to health
app.get('/', (req, res) => {
  res.redirect('/health');
});

app.listen(PORT, () => {
  console.log(`Ground Operations Backend running on port ${PORT}`);
  console.log(`Health check:    http://localhost:${PORT}/health`);
  console.log(`Public API:      http://localhost:${PORT}/api/raw-flights`);
  console.log(`In production:   https://aerfoirt.net/server/health`);
  console.log(`In production:   https://aerfoirt.net/server/api/raw-flights`);
});
