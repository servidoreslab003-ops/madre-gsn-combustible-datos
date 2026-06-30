const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    }
});

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
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================
// CONFIGURACIÓN
// ============================================
const BASE_PATH = __dirname;
const COMBUSTIBLE_PATH = path.join(BASE_PATH, 'combustible');
const PAGINAS_HIJO_PATH = path.join(COMBUSTIBLE_PATH, 'paginas_hijo');
const TEMPLATES_PATH = path.join(COMBUSTIBLE_PATH, 'templates');
const DATA_PATH = path.join(BASE_PATH, 'data');

// Crear carpetas
[COMBUSTIBLE_PATH, PAGINAS_HIJO_PATH, TEMPLATES_PATH, DATA_PATH].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Carpeta creada: ${dir}`);
    }
});

// ============================================
// ID FIJO
// ============================================
const ID_FIJO = 'GSN-6C1F7B42';
const URL_PUBLICA = 'https://madre-gsn-combustible-datos.onrender.com';

console.log(`🔒 ID FIJO: ${ID_FIJO}`);
console.log(`🌐 URL Pública: ${URL_PUBLICA}`);

// ============================================
// ESTADO DEL TÚNEL
// ============================================
let tunelActivo = false;
let clienteConectado = null;
let clienteId = null;
let clientesConectados = {};

// ============================================
// ARCHIVOS ESTÁTICOS
// ============================================
app.use('/paginas_hijo', express.static(PAGINAS_HIJO_PATH));
app.use('/templates', express.static(TEMPLATES_PATH));
app.use('/combustible', express.static(COMBUSTIBLE_PATH));

// ============================================
// FUNCIÓN PARA SERVIR HTML CON REEMPLAZOS
// ============================================
function servirHtmlConReemplazos(ruta, res) {
    if (!fs.existsSync(ruta)) {
        return false;
    }
    try {
        let html = fs.readFileSync(ruta, 'utf8');
        // Reemplazar API_URL con la URL pública
        html = html.replace(/var API_URL\s*=\s*"";/g, `var API_URL = "${URL_PUBLICA}";`);
        html = html.replace(/const API_URL\s*=\s*"";/g, `const API_URL = "${URL_PUBLICA}";`);
        html = html.replace(/let API_URL\s*=\s*"";/g, `let API_URL = "${URL_PUBLICA}";`);
        html = html.replace(/ID_FIJO/g, ID_FIJO);
        res.send(html);
        return true;
    } catch (e) {
        console.error(`❌ Error leyendo ${ruta}:`, e.message);
        return false;
    }
}

// ============================================
// RUTAS HTML
// ============================================

app.get('/fijo', (req, res) => {
    const estadoTunel = tunelActivo ? '🟢 Activo' : '🔴 Inactivo';
    const colorEstado = tunelActivo ? '#34d399' : '#f87171';
    
    res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Servidor Fijo - Grupo GSN</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{font-family:system-ui,sans-serif;background:#0a0f1c;color:#34d399;min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px;}
        .container{max-width:600px;width:100%;background:rgba(10,26,10,0.05);backdrop-filter:blur(30px);border-radius:28px;border:1px solid rgba(16,185,129,0.05);padding:40px 30px;text-align:center;}
        .logo{font-size:3rem;margin-bottom:15px;}
        .badge-fijo{background:rgba(245,158,11,0.1);color:#f59e0b;padding:4px 14px;border-radius:20px;font-size:0.6rem;font-weight:600;border:1px solid rgba(245,158,11,0.1);display:inline-block;margin-bottom:10px;}
        h1{font-size:1.5rem;color:#10b981;margin-bottom:5px;}
        .id-box{background:rgba(16,185,129,0.05);padding:15px 20px;border-radius:16px;font-family:monospace;font-size:2rem;color:#10b981;letter-spacing:4px;border:2px solid rgba(16,185,129,0.1);margin:15px 0;}
        .id-box .label{font-size:0.6rem;text-transform:uppercase;letter-spacing:2px;color:#34d399;opacity:0.3;display:block;margin-bottom:5px;}
        .status-tunel{display:inline-block;padding:6px 18px;border-radius:20px;font-size:0.7rem;font-weight:600;background:rgba(16,185,129,0.1);color:${colorEstado};border:1px solid ${colorEstado};margin:10px 0;}
        .btn{display:inline-block;padding:14px 30px;margin:8px 5px;background:linear-gradient(135deg,#10b981,#059669);border:none;border-radius:40px;color:white;text-decoration:none;font-weight:600;font-size:0.9rem;cursor:pointer;transition:all 0.3s;}
        .btn:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(16,185,129,0.3);}
        .btn-secondary{background:transparent;border:1px solid rgba(16,185,129,0.1);color:#34d399;}
        .btn-secondary:hover{background:rgba(16,185,129,0.05);}
        .info{margin-top:20px;font-size:0.6rem;color:#34d399;opacity:0.15;}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:15px 0;}
        .grid .item{background:rgba(16,185,129,0.03);padding:12px;border-radius:12px;border:1px solid rgba(16,185,129,0.03);}
        .grid .item .label{font-size:0.55rem;text-transform:uppercase;letter-spacing:1px;color:#34d399;opacity:0.3;}
        .grid .item .value{font-size:0.85rem;font-weight:600;margin-top:4px;color:#10b981;}
    </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">🔒</div>
            <div class="badge-fijo">ID FIJO - NUNCA CAMBIA</div>
            <h1>Servidor Fijo</h1>
            <div class="id-box"><span class="label">🆔 TU ID FIJO</span>${ID_FIJO}</div>
            <div class="status-tunel">${estadoTunel}</div>
            <div class="grid">
                <div class="item"><div class="label">URL Pública</div><div class="value" style="font-size:0.7rem;">${URL_PUBLICA}</div></div>
                <div class="item"><div class="label">Túnel</div><div class="value">${tunelActivo ? '✅ Activo' : '❌ Inactivo'}</div></div>
                ${clienteId ? `<div class="item"><div class="label">Cliente ID</div><div class="value" style="font-size:0.6rem;">${clienteId}</div></div>` : ''}
                <div class="item"><div class="label">Servidores</div><div class="value">${Object.keys(clientesConectados).length}</div></div>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
                <a href="/" class="btn">🏠 Inicio</a>
                <a href="/primogenito" class="btn" style="background:linear-gradient(135deg,#3b82f6,#2563eb);">📱 Primogénito</a>
                <a href="/conductor" class="btn" style="background:linear-gradient(135deg,#10b981,#059669);">🚛 Conductor</a>
            </div>
            <div class="info">Grupo GSN - Túnel Socket.io | ${new Date().toISOString().slice(0,19).replace('T', ' ')}</div>
        </div>
    </body>
    </html>
    `);
});

app.get('/primogenito', (req, res) => {
    const rutas = [
        path.join(PAGINAS_HIJO_PATH, 'primogenito.html'),
        path.join(COMBUSTIBLE_PATH, 'paginas_hijo', 'primogenito.html')
    ];
    for (const ruta of rutas) {
        if (servirHtmlConReemplazos(ruta, res)) return;
    }
    res.send(`<h1>📱 Primogénito</h1><p>Archivo no encontrado. Asegúrate de que primogenito.html esté en combustible/paginas_hijo/</p><p>🔒 ID: ${ID_FIJO}</p>`);
});

app.get('/conductor', (req, res) => {
    const rutas = [
        path.join(PAGINAS_HIJO_PATH, 'conductor.html'),
        path.join(COMBUSTIBLE_PATH, 'paginas_hijo', 'conductor.html')
    ];
    for (const ruta of rutas) {
        if (servirHtmlConReemplazos(ruta, res)) return;
    }
    res.send(`<h1>🚛 Conductor</h1><p>Archivo no encontrado. Asegúrate de que conductor.html esté en combustible/paginas_hijo/</p><p>🔒 ID: ${ID_FIJO}</p>`);
});

app.get('/dashboard', (req, res) => {
    const rutas = [
        path.join(TEMPLATES_PATH, 'deepseek_html_20260521_cee050.html'),
        path.join(COMBUSTIBLE_PATH, 'templates', 'deepseek_html_20260521_cee050.html')
    ];
    for (const ruta of rutas) {
        if (servirHtmlConReemplazos(ruta, res)) return;
    }
    res.redirect('/');
});

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Grupo GSN - Túnel</title>
    <style>
        body{background:#0a0f1c;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;text-align:center;margin:0;padding:20px;}
        .container{max-width:700px;}
        h1{color:#f59e0b;font-size:2.5rem;}
        .logo{font-size:4rem;margin-bottom:20px;}
        .cards{display:flex;flex-wrap:wrap;gap:15px;justify-content:center;margin:30px 0;}
        .card{background:rgba(255,255,255,0.05);padding:20px 30px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);min-width:150px;text-decoration:none;color:#fff;transition:all 0.3s;}
        .card:hover{transform:translateY(-5px);background:rgba(255,255,255,0.1);}
        .card .icon{font-size:2rem;display:block;margin-bottom:8px;}
        .card .title{font-weight:600;}
        .card.primogenito{border-color:#3b82f6;}
        .card.conductor{border-color:#10b981;}
        .card.fijo{border-color:#f59e0b;}
        .card.dashboard{border-color:#8b5cf6;}
        .id-box{background:rgba(245,158,11,0.05);padding:15px;border-radius:12px;border:1px solid rgba(245,158,11,0.1);margin:20px 0;font-family:monospace;font-size:1.2rem;color:#f59e0b;}
        .tunel-status{font-size:0.8rem;color:${tunelActivo ? '#34d399' : '#f87171'};}
    </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">⛽</div>
            <h1>GRUPO GSN</h1>
            <p>Sistema de Gestión de Combustible</p>
            <div class="id-box">🔒 ID FIJO: ${ID_FIJO}</div>
            <div class="tunel-status">${tunelActivo ? '🟢 Túnel Activo' : '🔴 Túnel Inactivo - Ejecuta main.py'}</div>
            <div class="cards">
                <a href="/dashboard" class="card dashboard"><span class="icon">📊</span><span class="title">Dashboard</span></a>
                <a href="/primogenito" class="card primogenito"><span class="icon">📱</span><span class="title">Primogénito</span></a>
                <a href="/conductor" class="card conductor"><span class="icon">🚛</span><span class="title">Conductor</span></a>
                <a href="/fijo" class="card fijo"><span class="icon">🔒</span><span class="title">Servidor Fijo</span></a>
            </div>
            <div style="font-size:0.6rem;color:rgba(255,255,255,0.15);">${new Date().toISOString().slice(0,19).replace('T', ' ')}</div>
        </div>
    </body>
    </html>
    `);
});

// ============================================
// API DE ESTADO DEL TÚNEL
// ============================================
app.get('/api/tunel/estado', (req, res) => {
    res.json({
        ok: true,
        activo: tunelActivo,
        id_fijo: ID_FIJO,
        url_publica: URL_PUBLICA,
        clientes_conectados: Object.keys(clientesConectados).length,
        cliente_id: clienteId,
        ultima_actualizacion: new Date().toISOString()
    });
});

app.get('/api/tunel/clientes', (req, res) => {
    res.json({
        ok: true,
        clientes: Object.values(clientesConectados),
        total: Object.keys(clientesConectados).length
    });
});

// ============================================
// ENDPOINTS DE COMPATIBILIDAD
// ============================================
app.get('/api/cloudflare_url', (req, res) => {
    res.json({
        ok: true,
        activo: tunelActivo,
        url: URL_PUBLICA,
        id: ID_FIJO,
        tunel_activo: tunelActivo,
        mensaje: tunelActivo ? 'Túnel activo' : 'Túnel inactivo'
    });
});

app.get('/api/estado_cloudflare', (req, res) => {
    res.json({
        ok: true,
        activo: tunelActivo,
        tunel_activo: tunelActivo,
        url_publica: URL_PUBLICA,
        id: ID_FIJO,
        mensaje: tunelActivo ? 'Túnel activo' : 'Túnel inactivo'
    });
});

app.get('/api/listar_enlaces', (req, res) => {
    res.json({
        ok: true,
        enlaces: [
            { id: 'publico', nombre: 'URL Pública', url: URL_PUBLICA, activo: true },
            { id: 'fijo', nombre: 'ID Fijo', url: `${URL_PUBLICA}/?id=${ID_FIJO}`, activo: true },
            { id: 'primogenito', nombre: '📱 Primogénito', url: `${URL_PUBLICA}/primogenito`, activo: true },
            { id: 'conductor', nombre: '🚛 Conductor', url: `${URL_PUBLICA}/conductor`, activo: true }
        ],
        total: 4
    });
});

// ============================================
// SOCKET.IO - TÚNEL PRINCIPAL
// ============================================

io.on('connection', (socket) => {
    console.log(`🔌 Cliente conectado: ${socket.id}`);
    
    socket.on('registro', (data) => {
        const { id_fijo, nombre, ip_local, version } = data;
        
        if (id_fijo === ID_FIJO) {
            clienteId = id_fijo;
            clienteConectado = socket.id;
            tunelActivo = true;
            
            clientesConectados[socket.id] = {
                id: socket.id,
                id_fijo: id_fijo,
                nombre: nombre || 'Servidor Local',
                ip_local: ip_local || 'No disponible',
                version: version || '1.0',
                conectado_desde: new Date().toISOString(),
                ultimo_heartbeat: new Date().toISOString()
            };
            
            console.log(`✅ Túnel activo con ID: ${id_fijo} (${nombre})`);
            console.log(`   IP Local: ${ip_local}`);
            
            socket.emit('registro_confirmado', {
                ok: true,
                id_fijo: ID_FIJO,
                url_publica: URL_PUBLICA,
                mensaje: 'Túnel establecido correctamente'
            });
            
            // Notificar a todos los clientes el estado del túnel
            io.emit('tunel_estado', {
                activo: true,
                id_fijo: ID_FIJO,
                clientes: Object.keys(clientesConectados).length
            });
        } else {
            socket.emit('registro_error', {
                ok: false,
                error: 'ID Fijo no coincide',
                esperado: ID_FIJO,
                recibido: id_fijo
            });
            console.log(`❌ ID incorrecto: ${id_fijo} (esperado: ${ID_FIJO})`);
            socket.disconnect();
        }
    });
    
    // Heartbeat para mantener el túnel vivo
    socket.on('heartbeat', (data) => {
        if (clientesConectados[socket.id]) {
            clientesConectados[socket.id].ultimo_heartbeat = new Date().toISOString();
            socket.emit('heartbeat_confirmado', { ok: true, timestamp: new Date().toISOString() });
        }
    });
    
    // Petición de API desde el cliente local
    socket.on('api_request', (data, callback) => {
        console.log(`📡 API Request: ${data.method} ${data.url}`);
        // Aquí se procesaría la petición (redirigir a main.py)
        // Pero main.py ya procesa sus propias peticiones
        // Este es para cuando main.py necesita hacer una petición a sí mismo vía Render
        callback({ ok: true, mensaje: 'Petición recibida' });
    });
    
    socket.on('disconnect', () => {
        console.log(`🔌 Cliente desconectado: ${socket.id}`);
        
        if (clienteConectado === socket.id) {
            clienteConectado = null;
            tunelActivo = false;
            clienteId = null;
            console.log('⚠️ Túnel cerrado');
            
            io.emit('tunel_estado', {
                activo: false,
                id_fijo: ID_FIJO,
                clientes: Object.keys(clientesConectados).length
            });
        }
        
        delete clientesConectados[socket.id];
    });
});

// ============================================
// LIMPIAR CLIENTES INACTIVOS
// ============================================
setInterval(() => {
    const ahora = new Date();
    for (const [id, cliente] of Object.entries(clientesConectados)) {
        const ultimo = new Date(cliente.ultimo_heartbeat);
        if ((ahora - ultimo) > 60000) { // 60 segundos sin heartbeat
            console.log(`⚠️ Cliente inactivo: ${id}`);
            delete clientesConectados[id];
            if (clienteConectado === id) {
                clienteConectado = null;
                tunelActivo = false;
                clienteId = null;
                console.log('⚠️ Túnel cerrado por inactividad');
            }
        }
    }
}, 30000);

// ============================================
// INICIAR SERVIDOR
// ============================================
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔒 TÚNEL SOCKET.IO - GRUPO GSN`);
    console.log(`${'='.repeat(60)}`);
    console.log(`   ID FIJO: ${ID_FIJO}`);
    console.log(`   Puerto: ${PORT}`);
    console.log(`   URL Pública: ${URL_PUBLICA}`);
    console.log(`   Modo: Túnel bidireccional (Socket.io)`);
    console.log(`\n📡 ESPERANDO CONEXIÓN DE main.py...`);
    console.log(`   Ejecuta: python main.py`);
    console.log(`   El túnel se activará automáticamente`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n📱 APPS DISPONIBLES:`);
    console.log(`   📱 Primogénito: ${URL_PUBLICA}/primogenito`);
    console.log(`   🚛 Conductor:   ${URL_PUBLICA}/conductor`);
    console.log(`   🔒 ID Fijo:     ${URL_PUBLICA}/fijo`);
    console.log(`   📊 Dashboard:   ${URL_PUBLICA}/dashboard`);
    console.log(`\n${'='.repeat(60)}`);
});
