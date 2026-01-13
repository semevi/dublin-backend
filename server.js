// This file acts as the backend server.
// It proxies requests to the DAA API and handles authentication headers.

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware Setup
// Enable CORS to allow requests from the React frontend (running on different port/domain)
app.use(cors());

// Log requests to the console for debugging
app.use(morgan('dev'));

// Parse JSON bodies (if needed for future POST requests)
app.use(express.json());

// --- Configuration ---
// Base URL for the DAA Operational API
const API_BASE_URL = 'https://api.daa.ie/dub/aops/flightdata/operational/v1';
// List of carriers we are interested in
const CARRIERS = 'EI,BA,IB,VY,I2,AA,T2';

/**
 * Helper function to retrieve API headers from environment variables.
 * Throws an error if keys are missing.
 */
const getHeaders = () => {
    const appId = process.env.APP_ID;
    const appKey = process.env.APP_KEY;
    
    if (!appId || !appKey) {
        console.error('Missing APP_ID or APP_KEY in .env file');
        throw new Error('Server misconfiguration: Missing API Credentials');
    }

    return {
        'app_id': appId,
        'app_key': appKey,
        'Accept': 'application/json'
    };
};

// --- Routes ---

/**
 * Root Route
 * Provides basic information about the API when accessing localhost:3000 directly.
 */
app.get('/', (req, res) => {
    res.json({
        name: 'Dublin Flight Proxy API',
        status: 'Running',
        endpoints: [
            '/health',
            '/flightdata',
            '/updates'
        ],
        documentation: 'This is a backend proxy. Use the frontend application to view data.'
    });
});

/**
 * Health Check Route
 * Used by the frontend to verify the server is running.
 */
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Server is healthy' });
});

/**
 * GET /flightdata
 * Proxies request to DAA flight data API.
 * Forwards any query parameters sent by the client.
 */
app.get('/flightdata', async (req, res) => {
    try {
        const url = `${API_BASE_URL}/carrier/${CARRIERS}`;
        
        console.log(`Fetching flight data from: ${url}`);

        const response = await axios.get(url, {
            headers: getHeaders(),
            params: req.query // Forward query params like ?date=...
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error in /flightdata:', error.message);
        
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            res.status(error.response.status).json({
                error: 'External API Error',
                details: error.response.data
            });
        } else if (error.request) {
            // The request was made but no response was received
            res.status(503).json({ error: 'No response from external API' });
        } else {
            // Something happened in setting up the request that triggered an Error
            res.status(500).json({ error: error.message });
        }
    }
});

/**
 * GET /updates
 * Proxies request to DAA updates API.
 */
app.get('/updates', async (req, res) => {
    try {
        const url = `${API_BASE_URL}/updates/carrier/${CARRIERS}`;
        
        console.log(`Fetching updates from: ${url}`);

        const response = await axios.get(url, {
            headers: getHeaders(),
            params: req.query
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error in /updates:', error.message);
        
        const status = error.response ? error.response.status : 500;
        const data = error.response ? error.response.data : { error: error.message };
        
        res.status(status).json(data);
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
