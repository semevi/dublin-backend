const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

// Мидлвар для парсинга данных форм и JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Настройка сессий для хранения ключей
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Главная страница с формой
app.get('/', (req, res) => {
    const keysInfo = req.session.app_id ? 
        `Текущие ключи: App ID: ${req.session.app_id}, App Key: ***${req.session.app_key?.slice(-4) || ''}` : 
        'Ключи не установлены';
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flight Data API</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 900px; 
            margin: 0 auto; 
            padding: 20px;
            background-color: #f0f2f5;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .container { 
            display: flex; 
            gap: 30px; 
            flex-wrap: wrap;
        }
        .form-section, .links-section { 
            flex: 1; 
            min-width: 300px;
        }
        .card {
            background: white;
            padding: 25px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        h2 {
            color: #333;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
            margin-top: 0;
        }
        label { 
            display: block; 
            margin: 15px 0 5px; 
            color: #555;
            font-weight: bold;
        }
        input { 
            width: 100%; 
            padding: 12px; 
            margin-bottom: 15px; 
            border: 2px solid #ddd;
            border-radius: 5px;
            font-size: 16px;
            box-sizing: border-box;
        }
        input:focus {
            border-color: #667eea;
            outline: none;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        button { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            border: none; 
            padding: 12px 25px; 
            cursor: pointer; 
            border-radius: 5px;
            font-size: 16px;
            font-weight: bold;
            width: 100%;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        button:hover { 
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        .links { 
            display: flex; 
            flex-direction: column; 
            gap: 15px; 
        }
        .link-btn {
            display: block;
            padding: 15px;
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            color: white;
            text-decoration: none;
            text-align: center;
            border-radius: 8px;
            font-weight: bold;
            font-size: 16px;
            transition: transform 0.2s, box-shadow 0.2s;
            border: none;
            cursor: pointer;
            margin-bottom: 5px;
        }
        .link-btn:hover { 
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
            color: white;
        }
        .link-btn.secondary {
            background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
        }
        .link-btn.secondary:hover {
            box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
        }
        .keys-info { 
            background: #e8f4fd; 
            padding: 15px; 
            border-radius: 8px; 
            margin-top: 20px;
            border-left: 4px solid #2196F3;
            font-family: monospace;
            word-break: break-all;
        }
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
            background-color: ${req.session.app_id ? '#4CAF50' : '#f44336'};
        }
        .response-container {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin-top: 20px;
            max-height: 400px;
            overflow-y: auto;
            display: none;
        }
        pre {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .alert {
            padding: 15px;
            border-radius: 5px;
            margin: 15px 0;
            text-align: center;
        }
        .alert.success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .alert.error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .btn-group {
            display: flex;
            gap: 10px;
            margin-top: 10px;
        }
        .btn-group .link-btn {
            flex: 1;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>✈️ Flight Data API</h1>
        <p>Управление API Dublin Airport Authority</p>
    </div>
    
    ${req.session.saveSuccess ? 
        '<div class="alert success">✅ Ключи успешно сохранены!</div>' : 
        ''}
    <% delete req.session.saveSuccess; %>
    
    <div class="container">
        <div class="form-section">
            <div class="card">
                <h2>🔑 Введите ключи API</h2>
                <form id="keysForm" action="/save-keys" method="POST">
                    <label for="app_id">App ID:</label>
                    <input type="text" id="app_id" name="app_id" 
                           placeholder="Введите ваш App ID" 
                           value="${req.session.app_id || ''}" required>
                    
                    <label for="app_key">App Key:</label>
                    <input type="password" id="app_key" name="app_key" 
                           placeholder="Введите ваш App Key" 
                           value="${req.session.app_key || ''}" required>
                    
                    <button type="submit">💾 Сохранить ключи</button>
                </form>
                
                <div class="keys-info">
                    <p><span class="status-indicator"></span>
                    <strong>Статус:</strong> ${keysInfo}</p>
                </div>
            </div>
        </div>
        
        <div class="links-section">
            <div class="card">
                <h2>🚀 Доступные действия:</h2>
                <div class="links">
                    <div class="btn-group">
                        <a href="/flights" class="link-btn" target="_blank" onclick="fetchData(event, '/flights')">
                            📋 Получить все рейсы
                        </a>
                        <button class="link-btn" onclick="fetchAndShow('/flights')">
                            👁️ Показать здесь
                        </button>
                    </div>
                    
                    <div class="btn-group">
                        <a href="/updates" class="link-btn secondary" target="_blank" onclick="fetchData(event, '/updates')">
                            🔄 Получить обновления
                        </a>
                        <button class="link-btn secondary" onclick="fetchAndShow('/updates')">
                            👁️ Показать здесь
                        </button>
                    </div>
                    
                    <a href="/current-keys" class="link-btn" onclick="fetchAndShow('/current-keys'); return false;">
                        🔍 Проверить сохраненные ключи
                    </a>
                    
                    <button class="link-btn" onclick="clearKeys()">
                        🗑️ Очистить ключи
                    </button>
                </div>
                
                <div id="responseContainer" class="response-container">
                    <h3>📄 Ответ от API:</h3>
                    <pre id="responseContent"></pre>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Показать ответ от API
        function showResponse(data, isError = false) {
            const container = document.getElementById('responseContainer');
            const content = document.getElementById('responseContent');
            
            try {
                const formattedData = typeof data === 'string' ? 
                    data : JSON.stringify(data, null, 2);
                content.textContent = formattedData;
                container.style.display = 'block';
                
                if (isError) {
                    content.style.color = '#dc3545';
                } else {
                    content.style.color = '#28a745';
                }
                
                container.scrollIntoView({ behavior: 'smooth' });
            } catch (e) {
                content.textContent = 'Ошибка форматирования данных: ' + e.message;
                content.style.color = '#dc3545';
                container.style.display = 'block';
            }
        }

        // Получить данные и показать на странице
        async function fetchAndShow(endpoint) {
            try {
                const response = await fetch(endpoint);
                const data = await response.json();
                
                if (!response.ok) {
                    showResponse(data, true);
                } else {
                    showResponse(data, false);
                }
            } catch (error) {
                showResponse('Ошибка соединения: ' + error.message, true);
            }
        }

        // Получить данные в новом окне (резервный вариант)
        function fetchData(event, endpoint) {
            if (!event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                fetchAndShow(endpoint);
            }
        }

        // Очистить ключи
        async function clearKeys() {
            if (confirm('Вы уверены, что хотите очистить сохраненные ключи?')) {
                try {
                    const response = await fetch('/clear-keys', { method: 'POST' });
                    if (response.ok) {
                        location.reload();
                    }
                } catch (error) {
                    showResponse('Ошибка при очистке ключей: ' + error.message, true);
                }
            }
        }

        // Автоматически фокусироваться на первом поле ввода
        document.addEventListener('DOMContentLoaded', function() {
            if (!${req.session.app_id ? 'true' : 'false'}) {
                document.getElementById('app_id').focus();
            }
            
            // Показать уведомление о необходимости ключей
            if (!${req.session.app_id ? 'true' : 'false'}) {
                const container = document.getElementById('responseContainer');
                const content = document.getElementById('responseContent');
                content.textContent = '⚠️ Для работы с API необходимо сначала ввести и сохранить ключи в форме слева.';
                content.style.color = '#ffc107';
                container.style.display = 'block';
            }
        });

        // Обработчик формы (для AJAX отправки)
        document.getElementById('keysForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            
            try {
                const response = await fetch('/save-keys', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams(formData)
                });
                
                if (response.ok) {
                    window.location.href = '/?saved=true';
                } else {
                    const error = await response.text();
                    showResponse(error, true);
                }
            } catch (error) {
                showResponse('Ошибка при сохранении ключей: ' + error.message, true);
            }
        });
    </script>
</body>
</html>`;
    
    res.send(html);
});

// Сохранение ключей в сессию
app.post('/save-keys', (req, res) => {
    req.session.app_id = req.body.app_id;
    req.session.app_key = req.body.app_key;
    req.session.saveSuccess = true;
    res.redirect('/');
});

// Очистка ключей
app.post('/clear-keys', (req, res) => {
    req.session.app_id = null;
    req.session.app_key = null;
    res.json({ success: true, message: 'Ключи очищены' });
});

// Получение всех рейсов
app.get('/flights', async (req, res) => {
    try {
        if (!req.session.app_id || !req.session.app_key) {
            return res.status(401).json({ 
                error: 'Ключи не установлены', 
                message: 'Вернитесь на главную и введите app_id и app_key.' 
            });
        }

        const response = await fetch(
            'https://api.daa.ie/dub/aops/flightdata/operational/v1/carrier/EI,BA,IB,VY,I2,AA,T2',
            {
                headers: {
                    'app_id': req.session.app_id,
                    'app_key': req.session.app_key
                }
            }
        );

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching flights:', error);
        res.status(500).json({ 
            error: 'Ошибка при получении данных о рейсах', 
            details: error.message 
        });
    }
});

// Получение обновлений
app.get('/updates', async (req, res) => {
    try {
        if (!req.session.app_id || !req.session.app_key) {
            return res.status(401).json({ 
                error: 'Ключи не установлены', 
                message: 'Вернитесь на главную и введите app_id и app_key.' 
            });
        }

        const response = await fetch(
            'https://api.daa.ie/dub/aops/flightdata/operational/v1/updates/carrier/EI,BA,IB,VY,I2,AA,T2',
            {
                headers: {
                    'app_id': req.session.app_id,
                    'app_key': req.session.app_key
                }
            }
        );

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching updates:', error);
        res.status(500).json({ 
            error: 'Ошибка при получении обновлений', 
            details: error.message 
        });
    }
});

// Получение текущих ключей
app.get('/current-keys', (req, res) => {
    res.json({
        app_id: req.session.app_id || null,
        app_key: req.session.app_key ? '***' + req.session.app_key.slice(-4) : null,
        status: req.session.app_id ? 'keys_set' : 'no_keys'
    });
});

// Маршрут для проверки здоровья сервера
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        session_keys: !!req.session.app_id 
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📝 Главная страница: http://localhost:${PORT}/`);
    console.log(`🔧 Проверка здоровья: http://localhost:${PORT}/health`);
});
