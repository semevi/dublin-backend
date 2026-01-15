const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

// HTML Template Generator
const getHtml = (message = '', type = 'info') => {
  const messageColor = type === 'error' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-green-100 text-green-700 border-green-200';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DAA API Interface</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 min-h-screen flex items-center justify-center font-sans text-slate-800">
    <div class="max-w-2xl w-full mx-4">
        <!-- Header -->
        <div class="bg-white rounded-t-xl shadow-sm border-b border-slate-200 p-8 text-center">
            <h1 class="text-3xl font-bold text-blue-600 mb-2">DAA API</h1>
            <p class="text-slate-500">Dublin Airport Operational Flight Data</p>
        </div>

        <!-- Main Content -->
        <div class="bg-white rounded-b-xl shadow-lg p-8 space-y-8">
            
            ${message ? `<div class="p-4 rounded-lg border ${messageColor}">${message}</div>` : ''}

            <!-- Step 1: Authorization -->
            <section>
                <div class="flex items-center gap-3 mb-4">
                    <span class="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold text-sm">1</span>
                    <h2 class="text-xl font-semibold">Authorization Configuration</h2>
                </div>
                <div class="bg-slate-50 p-6 rounded-lg border border-slate-200">
                    <form action="/set-auth" method="POST" class="space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">App ID</label>
                                <input type="text" name="app_id" placeholder="Enter App ID" required 
                                    class="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">App Key</label>
                                <input type="text" name="app_key" placeholder="Enter App Key" required 
                                    class="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all">
                            </div>
                        </div>
                        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
                            Save Credentials
                        </button>
                    </form>
                </div>
            </section>

            <hr class="border-slate-100" />

            <!-- Step 2: Data Retrieval -->
            <section>
                <div class="flex items-center gap-3 mb-4">
                    <span class="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-600 font-bold text-sm">2</span>
                    <h2 class="text-xl font-semibold">Data Endpoints</h2>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <a href="/proxy/operational" target="_blank" class="group relative flex flex-col items-center justify-center p-6 bg-white border-2 border-slate-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all cursor-pointer text-center no-underline">
                        <div class="mb-3 p-3 bg-purple-100 text-purple-600 rounded-full group-hover:scale-110 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                        </div>
                        <span class="font-semibold text-slate-800 group-hover:text-purple-700">Get Operational Data</span>
                        <span class="text-xs text-slate-500 mt-1">/operational/v1/carrier/...</span>
                    </a>

                    <a href="/proxy/updates" target="_blank" class="group relative flex flex-col items-center justify-center p-6 bg-white border-2 border-slate-200 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 transition-all cursor-pointer text-center no-underline">
                        <div class="mb-3 p-3 bg-emerald-100 text-emerald-600 rounded-full group-hover:scale-110 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </div>
                        <span class="font-semibold text-slate-800 group-hover:text-emerald-700">Get Updates</span>
                        <span class="text-xs text-slate-500 mt-1">/updates/carrier/...</span>
                    </a>
                </div>
            </section>
        </div>
        
        <div class="text-center mt-6 text-slate-400 text-sm">
            Powered by Node.js & Tailwind CSS
        </div>
    </div>
</body>
</html>
`};

// Routes

// 1. Main Page
app.get('/', (req, res) => {
    res.send(getHtml());
});

// 2. Set Headers (Auth)
app.post('/set-auth', (req, res) => {
    const { app_id, app_key } = req.body;
    
    if (!app_id || !app_key) {
        return res.send(getHtml('Both App ID and App Key are required.', 'error'));
    }

    // Store credentials in HTTP-only cookies
    res.cookie('app_id', app_id, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // 1 day
    res.cookie('app_key', app_key, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    
    res.send(getHtml('Authorization headers have been recorded successfully. You can now use the API links.', 'success'));
});

// Helper function for API proxying
const fetchFromDaa = async (req, res, endpointUrl) => {
    const { app_id, app_key } = req.cookies;

    if (!app_id || !app_key) {
        return res.status(401).send(getHtml('Unauthorized. Please set App ID and App Key first using the form.', 'error'));
    }

    try {
        const response = await axios.get(endpointUrl, {
            headers: {
                'app_id': app_id,
                'app_key': app_key,
                'Accept': 'application/json'
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json({
            error: 'Failed to fetch data from DAA API',
            message: error.message,
            upstream_response: error.response?.data
        });
    }
};

// 3. Proxy Link: Operational Data
app.get('/proxy/operational', (req, res) => {
    const url = 'https://api.daa.ie/dub/aops/flightdata/operational/v1/carrier/EI,BA,IB,VY,I2,AA,T2';
    fetchFromDaa(req, res, url);
});

// 4. Proxy Link: Updates Data
app.get('/proxy/updates', (req, res) => {
    const url = 'https://api.daa.ie/dub/aops/flightdata/operational/v1/updates/carrier/EI,BA,IB,VY,I2,AA,T2';
    fetchFromDaa(req, res, url);
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
