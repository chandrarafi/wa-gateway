const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const app = express();
const port = 3001;

// Middleware untuk parsing JSON
app.use(express.json());

// Rate limiting
const rateLimit = {
    windowMs: 60 * 1000, // 1 menit
    maxRequests: {},
    resetTime: {}
};

// Middleware untuk rate limiting
const rateLimiter = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();

    // Reset counter jika sudah lewat windowMs
    if (rateLimit.resetTime[ip] && now > rateLimit.resetTime[ip]) {
        rateLimit.maxRequests[ip] = 0;
    }

    // Inisialisasi counter untuk IP baru
    if (!rateLimit.maxRequests[ip]) {
        rateLimit.maxRequests[ip] = 0;
        rateLimit.resetTime[ip] = now + rateLimit.windowMs;
    }

    // Increment counter
    rateLimit.maxRequests[ip]++;

    // Cek limit
    if (rateLimit.maxRequests[ip] > 60) { // maksimal 60 request per menit
        return res.status(429).json({
            status: 'error',
            message: 'Terlalu banyak request. Silakan coba lagi nanti.'
        });
    }

    next();
};

// Terapkan rate limiting ke semua route
app.use(rateLimiter);

// Inisialisasi WhatsApp client dengan konfigurasi tambahan
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--dns-prefetch-disable',
            '--disable-extensions',
            '--disable-default-apps',
            '--disable-sync',
            '--no-default-browser-check',
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--disable-translate',
            '--disable-web-security',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--allow-running-insecure-content'
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: null,
    }
});

let qrCodeData = '';
let isClientReady = false;

client.on('qr', async (qr) => {
    console.log('QR Code received');
    try {
        qrCodeData = await qrcode.toDataURL(qr);
        console.log('QR Code generated successfully');
    } catch (err) {
        console.error('Error generating QR code:', err);
    }
});

client.on('ready', () => {
    console.log('Client is ready!');
    isClientReady = true;
    qrCodeData = ''; // Hapus QR code data ketika sudah ready
});

client.on('message', msg => {
    console.log('Pesan masuk:', msg.body);
});

client.on('disconnected', (reason) => {
    console.log('Client was disconnected', reason);
    isClientReady = false;
});

// Endpoint untuk halaman utama
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp Gateway Status</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                    background-color: #f0f0f0;
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
                    padding: 10px;
                    margin: 10px 0;
                    border-radius: 4px;
                }
                .ready {
                    background-color: #d4edda;
                    color: #155724;
                }
                .not-ready {
                    background-color: #f8d7da;
                    color: #721c24;
                }
                .qr-container {
                    text-align: center;
                    margin: 20px 0;
                }
                .qr-image {
                    max-width: 300px;
                    margin: 0 auto;
                }
            </style>
            <script>
                function checkStatus() {
                    fetch('/status')
                        .then(response => response.json())
                        .then(data => {
                            const statusDiv = document.getElementById('status');
                            const qrContainer = document.getElementById('qr-container');
                            
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
                                    // Refresh QR code image
                                    const qrImage = document.getElementById('qr-image');
                                    if (qrImage) {
                                        qrImage.src = qrCodeData || '';
                                    }
                                }
                            }
                        });
                }
                
                // Check status setiap 5 detik
                setInterval(checkStatus, 5000);
                // Check status saat halaman dimuat
                window.onload = checkStatus;
            </script>
        </head>
        <body>
            <div class="container">
                <h1>WhatsApp Gateway Status</h1>
                <div id="status" class="status">Mengecek status...</div>
                <div id="qr-container" class="qr-container">
                    ${qrCodeData ? `<img id="qr-image" src="${qrCodeData}" class="qr-image" />` : '<p>Menunggu QR Code...</p>'}
                </div>
            </div>
        </body>
        </html>
    `);
});

// Endpoint untuk mengirim pesan dengan rate limiting khusus
app.post('/send-message', async (req, res) => {
    // Rate limiting khusus untuk endpoint send-message
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
    
    if (rateLimit.maxRequests[`${ip}_send`] > 30) { // maksimal 30 pesan per menit
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

        // Memastikan format nomor benar
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
        isReady: isClientReady
    });
});

// Mulai server Express
app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});

// Error handling untuk client
client.on('auth_failure', msg => {
    console.error('Authentication failure:', msg);
    isClientReady = false;
});

client.on('error', err => {
    console.error('Client error:', err);
});

// Inisialisasi WhatsApp client
console.log('Menginisialisasi WhatsApp client...');
client.initialize().catch(err => {
    console.error('Failed to initialize client:', err);
}); 