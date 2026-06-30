const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));

// ============================================
// CONFIGURACIÓN DEL TÚNEL
// ============================================
// ¡CAMBIAR POR TU IP LOCAL ACTUAL!
const TU_IP_LOCAL = '192.168.1.33';
const PUERTO_LOCAL = 5000;

console.log(`🔒 Túnel configurado: Render → http://${TU_IP_LOCAL}:${PUERTO_LOCAL}`);

// ============================================
// ID FIJO (sincronizado con servidor_publico.py)
// ============================================
const ID_FIJO = 'GSN-6C1F7B42';

// ============================================
// PROXY - TÚNEL COMPLETO
// ============================================

// Reenviar TODAS las peticiones a main.py local
app.use('/', createProxyMiddleware({
    target: `http://${TU_IP_LOCAL}:${PUERTO_LOCAL}`,
    changeOrigin: true,
    ws: true,  // Soporte para WebSockets
    logLevel: 'info',
    onProxyReq: (proxyReq, req, res) => {
        console.log(`🔄 ${req.method} ${req.url} → ${TU_IP_LOCAL}:${PUERTO_LOCAL}`);
    },
    onError: (err, req, res) => {
        console.error(`❌ Error de túnel: ${err.message}`);
        res.status(502).send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><title>🔌 Túnel no disponible</title>
            <style>
                *{margin:0;padding:0;box-sizing:border-box;}
                body{background:#0a0f1c;color:#e2e8f0;font-family:system-ui,sans-serif;min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px;}
                .container{max-width:500px;width:100%;background:rgba(10,26,10,0.05);backdrop-filter:blur(30px);border-radius:28px;border:1px solid rgba(16,185,129,0.05);padding:40px 30px;text-align:center;}
                .icono{font-size:4rem;margin-bottom:20px;}
                h1{font-size:1.5rem;color:#f87171;margin-bottom:10px;}
                p{color:#94a3b8;font-size:0.9rem;line-height:1.6;}
                .ip-info{background:rgba(16,185,129,0.05);border-radius:16px;padding:15px;margin:20px 0;border:1px solid rgba(16,185,129,0.1);}
                .ip-info .label{font-size:0.55rem;text-transform:uppercase;letter-spacing:2px;color:#34d399;opacity:0.3;}
                .ip-info .valor{font-size:1rem;font-weight:600;color:#10b981;font-family:monospace;margin-top:4px;}
                .steps{text-align:left;background:rgba(255,255,255,0.03);border-radius:16px;padding:15px 20px;margin:15px 0;}
                .steps li{font-size:0.7rem;color:#94a3b8;padding:4px 0;list-style-position:inside;}
                .btn{display:inline-block;padding:12px 30px;margin-top:15px;background:linear-gradient(135deg,#10b981,#059669);border:none;border-radius:40px;color:white;text-decoration:none;font-weight:600;font-size:0.85rem;cursor:pointer;transition:all 0.3s;}
                .btn:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(16,185,129,0.3);}
                .id-fijo{color:#f59e0b;font-size:0.7rem;margin-top:15px;font-family:monospace;}
                .footer{font-size:0.5rem;color:rgba(255,255,255,0.08);margin-top:20px;}
            </style>
            </head>
            <body>
                <div class="container">
                    <div class="icono">🔌</div>
                    <h1>Servidor Local no disponible</h1>
                    <p>No se pudo conectar a <strong>main.py</strong> en tu PC local.</p>
                    <div class="ip-info">
                        <div class="label">📍 IP Local del Servidor</div>
                        <div class="valor">${TU_IP_LOCAL}:${PUERTO_LOCAL}</div>
                    </div>
                    <div class="steps">
                        <li>Ejecuta <strong>python main.py</strong> en tu PC</li>
                        <li>Verifica que el puerto ${PUERTO_LOCAL} esté abierto</li>
                        <li>Asegúrate de estar en la misma red</li>
                    </div>
                    <button class="btn" onclick="window.location.reload()">🔄 Reintentar</button>
                    <div class="id-fijo">🔒 ID FIJO: ${ID_FIJO}</div>
                    <div class="footer">Grupo GSN · Túnel Render · ${new Date().toLocaleString()}</div>
                </div>
            </body>
            </html>
        `);
    }
}));

// ============================================
// ENDPOINT DE ESTADO (NO HACE PROXY)
// ============================================
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        id_fijo: ID_FIJO,
        tunel: {
            activo: true,
            ip_local: TU_IP_LOCAL,
            puerto_local: PUERTO_LOCAL,
            modo: 'proxy_inverso'
        },
        version: '2.0.0'
    });
});

app.get('/api/tunel/estado', (req, res) => {
    res.json({
        ok: true,
        activo: true,
        id_fijo: ID_FIJO,
        ip_local: TU_IP_LOCAL,
        puerto: PUERTO_LOCAL,
        url_publica: 'https://madre-gsn-combustible-datos.onrender.com'
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔒 TÚNEL RENDER - GRUPO GSN`);
    console.log(`${'='.repeat(60)}`);
    console.log(`   ID FIJO: ${ID_FIJO}`);
    console.log(`   Puerto: ${PORT}`);
    console.log(`   📡 TÚNEL ACTIVO:`);
    console.log(`      https://madre-gsn-combustible-datos.onrender.com`);
    console.log(`      → http://${TU_IP_LOCAL}:${PUERTO_LOCAL}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n📱 APPS DISPONIBLES:`);
    console.log(`   📱 Primogénito: https://madre-gsn-combustible-datos.onrender.com/primogenito`);
    console.log(`   🚛 Conductor:   https://madre-gsn-combustible-datos.onrender.com/conductor`);
    console.log(`   🔒 ID Fijo:     https://madre-gsn-combustible-datos.onrender.com/fijo`);
    console.log(`\n💡 TÚNEL SIMILAR A CLOUDFLARE`);
    console.log(`   - No necesitas abrir puertos`);
    console.log(`   - URL pública fija`);
    console.log(`   - Acceso desde cualquier lugar`);
    console.log(`${'='.repeat(60)}`);
});
