// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Allow requests from any domain
app.use(morgan('dev')); // Logger
app.use(express.json());

// Configuration for External API
const API_BASE_URL = 'https://api.daa.ie/dub/aops/flightdata/operational/v1';
const CARRIERS = 'EI,BA,IB,VY,I2,AA,T2';

// Helper to get headers
const getHeaders = () => {
    const appId = process.env.APP_ID;
    const appKey = process.env.APP_KEY;
    
    if (!appId || !appKey) {
        throw new Error('APP_ID or APP_KEY is missing in environment variables');
    }

    return {
        'app_id': appId,
        'app_key': appKey,
        'Accept': 'application/json'
    };
};

// Health Check Route
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Route: GET /flightdata
app.get('/flightdata', async (req, res) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/carrier/${CARRIERS}`, {
            headers: getHeaders(),
            params: req.query // Pass through any query parameters
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching flight data:', error.message);
        const status = error.response ? error.response.status : 500;
        const message = error.response ? error.response.data : 'Internal Server Error';
        res.status(status).json({ error: message });
    }
});

// Route: GET /updates
app.get('/updates', async (req, res) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/updates/carrier/${CARRIERS}`, {
            headers: getHeaders(),
            params: req.query
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching updates:', error.message);
        const status = error.response ? error.response.status : 500;
        const message = error.response ? error.response.data : 'Internal Server Error';
        res.status(status).json({ error: message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
