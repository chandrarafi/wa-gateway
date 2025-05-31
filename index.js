const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const puppeteer = require('puppeteer');
const app = express();
const port = process.env.PORT || 3001;

// Middleware untuk parsing JSON
app.use(express.json());

// Rate limiting
const rateLimit = {
    windowMs: 60 * 1000,
    maxRequests: {},
    resetTime: {}
};

// Middleware untuk rate limiting
const rateLimiter = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();

    if (rateLimit.resetTime[ip] && now > rateLimit.resetTime[ip]) {
        rateLimit.maxRequests[ip] = 0;
    }

    if (!rateLimit.maxRequests[ip]) {
        rateLimit.maxRequests[ip] = 0;
        rateLimit.resetTime[ip] = now + rateLimit.windowMs;
    }

    rateLimit.maxRequests[ip]++;

    if (rateLimit.maxRequests[ip] > 60) {
        return res.status(429).json({
            status: 'error',
            message: 'Terlalu banyak request. Silakan coba lagi nanti.'
        });
    }

    next();
};

app.use(rateLimiter);

// Inisialisasi WhatsApp client dengan konfigurasi untuk Vercel
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: '/tmp/.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu',
            '--no-zygote',
            '--single-process',
            '--disable-extensions',
            '--disable-sync',
            '--disable-translate',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-breakpad',
            '--disable-client-side-phishing-detection',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--disable-dev-shm-usage',
            '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints',
            '--disable-hang-monitor',
            '--disable-ipc-flooding-protection',
            '--disable-popup-blocking',
            '--disable-prompt-on-repost',
            '--disable-renderer-backgrounding',
            '--disable-web-security',
            '--ignore-certificate-errors',
            '--no-default-browser-check',
            '--no-experiments',
            '--no-pings',
            '--password-store=basic'
        ],
        ignoreHTTPSErrors: true,
        browserWSEndpoint: null,
        product: 'chrome',
        browserRevision: null
    }
});

let qrCodeData = '';
let isClientReady = false;
let lastError = '';
let connectionStatus = 'Menginisialisasi...';

client.on('qr', async (qr) => {
    console.log('QR Code received');
    try {
        qrCodeData = await qrcode.toDataURL(qr);
        connectionStatus = 'Menunggu scan QR Code...';
        console.log('QR Code generated successfully');
    } catch (err) {
        console.error('Error generating QR code:', err);
        lastError = err.message;
    }
});

client.on('ready', () => {
    console.log('Client is ready!');
    isClientReady = true;
    qrCodeData = '';
    connectionStatus = 'WhatsApp Client siap digunakan!';
});

client.on('message', msg => {
    console.log('Pesan masuk:', msg.body);
});

client.on('disconnected', (reason) => {
    console.log('Client was disconnected', reason);
    isClientReady = false;
    connectionStatus = 'Terputus: ' + reason;
});

// Endpoint untuk halaman utama
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp Gateway Status</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                    background-color: #f0f0f0;
                    color: #333;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    background-color: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .status {
                    padding: 15px;
                    margin: 15px 0;
                    border-radius: 4px;
                    font-weight: bold;
                }
                .ready {
                    background-color: #d4edda;
                    color: #155724;
                    border: 1px solid #c3e6cb;
                }
                .not-ready {
                    background-color: #f8d7da;
                    color: #721c24;
                    border: 1px solid #f5c6cb;
                }
                .qr-container {
                    text-align: center;
                    margin: 20px 0;
                    padding: 20px;
                    background-color: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .qr-image {
                    max-width: 300px;
                    margin: 0 auto;
                }
                .info {
                    background-color: #e2e3e5;
                    color: #383d41;
                    padding: 15px;
                    margin: 15px 0;
                    border-radius: 4px;
                    border: 1px solid #d6d8db;
                }
                .error {
                    color: #721c24;
                    background-color: #f8d7da;
                    padding: 10px;
                    margin: 10px 0;
                    border-radius: 4px;
                    border: 1px solid #f5c6cb;
                }
                .api-docs {
                    background-color: #fff;
                    padding: 20px;
                    margin-top: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                code {
                    background-color: #f8f9fa;
                    padding: 2px 5px;
                    border-radius: 3px;
                    font-family: monospace;
                }
            </style>
            <script>
                function checkStatus() {
                    fetch('/status')
                        .then(response => response.json())
                        .then(data => {
                            const statusDiv = document.getElementById('status');
                            const qrContainer = document.getElementById('qr-container');
                            const connectionStatusDiv = document.getElementById('connection-status');
                            
                            connectionStatusDiv.textContent = data.connectionStatus;
                            
                            if (data.isReady) {
                                statusDiv.className = 'status ready';
                                statusDiv.innerHTML = 'WhatsApp Client sudah siap!';
                                if (qrContainer) {
                                    qrContainer.style.display = 'none';
                                }
                            } else {
                                statusDiv.className = 'status not-ready';
                                statusDiv.innerHTML = 'WhatsApp Client belum siap. Silakan scan QR Code.';
                                if (qrContainer) {
                                    qrContainer.style.display = 'block';
                                }
                            }
                        })
                        .catch(error => {
                            console.error('Error checking status:', error);
                        });
                }
                
                setInterval(checkStatus, 5000);
                window.onload = checkStatus;
            </script>
        </head>
        <body>
            <div class="container">
                <h1>WhatsApp Gateway Status</h1>
                <div id="status" class="status">Mengecek status...</div>
                <div id="connection-status" class="info">${connectionStatus}</div>
                ${lastError ? `<div class="error">Error terakhir: ${lastError}</div>` : ''}
                <div id="qr-container" class="qr-container">
                    ${qrCodeData ? 
                        `<img id="qr-image" src="${qrCodeData}" class="qr-image" alt="QR Code" />` : 
                        '<p>Menunggu QR Code...</p>'
                    }
                </div>
                
                <div class="api-docs">
                    <h2>API Documentation</h2>
                    <h3>Mengirim Pesan</h3>
                    <p>Endpoint: <code>POST /send-message</code></p>
                    <p>Body:</p>
                    <pre><code>{
    "number": "6281234567890",
    "message": "Halo, ini pesan dari WhatsApp Gateway!"
}</code></pre>
                    <p>Rate Limit: 30 pesan per menit per IP</p>
                    
                    <h3>Cek Status</h3>
                    <p>Endpoint: <code>GET /status</code></p>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Endpoint untuk mengirim pesan
app.post('/send-message', async (req, res) => {
    const ip = req.ip;
    const now = Date.now();
    
    if (!rateLimit.maxRequests[`${ip}_send`]) {
        rateLimit.maxRequests[`${ip}_send`] = 0;
        rateLimit.resetTime[`${ip}_send`] = now + rateLimit.windowMs;
    }
    
    if (now > rateLimit.resetTime[`${ip}_send`]) {
        rateLimit.maxRequests[`${ip}_send`] = 0;
        rateLimit.resetTime[`${ip}_send`] = now + rateLimit.windowMs;
    }
    
    rateLimit.maxRequests[`${ip}_send`]++;
    
    if (rateLimit.maxRequests[`${ip}_send`] > 30) {
        return res.status(429).json({
            status: 'error',
            message: 'Terlalu banyak request pengiriman pesan. Silakan coba lagi nanti.'
        });
    }

    try {
        const { number, message } = req.body;
        
        if (!number || !message) {
            return res.status(400).json({
                status: 'error',
                message: 'Nomor dan pesan harus diisi'
            });
        }

        if (!isClientReady) {
            return res.status(503).json({
                status: 'error',
                message: 'WhatsApp client belum siap. Silakan scan QR Code terlebih dahulu.'
            });
        }

        let formattedNumber = number;
        if (!formattedNumber.endsWith('@c.us')) {
            formattedNumber = `${formattedNumber}@c.us`;
        }

        const msg = await client.sendMessage(formattedNumber, message);
        res.json({
            status: 'success',
            message: 'Pesan terkirim',
            data: msg
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Endpoint untuk cek status
app.get('/status', (req, res) => {
    res.json({
        status: 'success',
        message: 'WhatsApp Gateway is running',
        isReady: isClientReady,
        connectionStatus,
        lastError
    });
});

app.listen(port, () => {
    console.log(`Server berjalan di port ${port}`);
    connectionStatus = 'Server berjalan, menginisialisasi WhatsApp client...';
});

client.on('auth_failure', msg => {
    console.error('Authentication failure:', msg);
    isClientReady = false;
    connectionStatus = 'Autentikasi gagal';
    lastError = msg;
});

client.on('error', err => {
    console.error('Client error:', err);
    lastError = err.message;
});

console.log('Menginisialisasi WhatsApp client...');
client.initialize().catch(err => {
    console.error('Failed to initialize client:', err);
    lastError = err.message;
    connectionStatus = 'Gagal menginisialisasi client';
}); 