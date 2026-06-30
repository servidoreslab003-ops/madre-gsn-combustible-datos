const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Data']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================
// CONFIGURACIÓN - TU IP LOCAL
// ============================================
// ¡CAMBIAR POR TU IP LOCAL!
const TU_IP_LOCAL = '192.168.1.33';
const PUERTO_LOCAL = 5000;

// ============================================
// CARPETAS
// ============================================
const BASE_PATH = __dirname;
const DATA_PATH = path.join(BASE_PATH, 'data');
const COMBUSTIBLE_PATH = path.join(BASE_PATH, 'combustible');
const PAGINAS_HIJO_PATH = path.join(COMBUSTIBLE_PATH, 'paginas_hijo');
const TEMPLATES_PATH = path.join(COMBUSTIBLE_PATH, 'templates');

// Crear carpetas necesarias
[DATA_PATH, COMBUSTIBLE_PATH, PAGINAS_HIJO_PATH, TEMPLATES_PATH].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Carpeta creada: ${dir}`);
    }
});

// ============================================
// ARCHIVOS
// ============================================
const USUARIOS_FILE = path.join(DATA_PATH, 'usuarios.json');
const DISPOSITIVOS_FILE = path.join(DATA_PATH, 'dispositivos.json');
const URL_PUBLICA_FILE = path.join(DATA_PATH, 'url_publica.json');

// ============================================
// ID FIJO (Sincronizado con servidor_publico.py)
// ============================================
let ID_FIJO = null;
const URL_RENDER = "https://madre-gsn-combustible-datos.onrender.com";

function generarIdFijo() {
    if (fs.existsSync(DISPOSITIVOS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(DISPOSITIVOS_FILE, 'utf8'));
            if (data.id_fijo) {
                ID_FIJO = data.id_fijo;
                console.log(`🔒 ID Fijo cargado: ${ID_FIJO}`);
                return ID_FIJO;
            }
        } catch (e) {
            console.warn('⚠️ Error cargando ID:', e.message);
        }
    }

    try {
        const interfaces = os.networkInterfaces();
        let mac = '';
        for (const iface of Object.values(interfaces)) {
            for (const info of iface) {
                if (!info.internal && info.mac && info.mac !== '00:00:00:00:00:00') {
                    mac = info.mac;
                    break;
                }
            }
            if (mac) break;
        }
        
        const hostname = os.hostname();
        const timestamp = new Date().toISOString();
        const base = `${mac}-${hostname}-${timestamp}`;
        const hash = crypto.createHash('md5').update(base).digest('hex').substring(0, 8).toUpperCase();
        ID_FIJO = `GSN-${hash}`;
        
        fs.writeFileSync(DISPOSITIVOS_FILE, JSON.stringify({
            id_fijo: ID_FIJO,
            fecha_creacion: new Date().toISOString(),
            hostname: hostname,
            mac: mac,
            entorno: "render"
        }, null, 2));
        
        console.log(`🔒 Nuevo ID Fijo generado: ${ID_FIJO}`);
        return ID_FIJO;
    } catch (e) {
        ID_FIJO = `GSN-${Math.floor(Math.random() * 90000) + 10000}`;
        console.log(`🔒 ID Fijo fallback: ${ID_FIJO}`);
        return ID_FIJO;
    }
}

// ============================================
// FUNCIONES DE URL PÚBLICA
// ============================================
function obtenerUrlPublica() {
    if (fs.existsSync(URL_PUBLICA_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(URL_PUBLICA_FILE, 'utf8'));
            if (data.url) return data.url;
        } catch (e) {}
    }
    return URL_RENDER;
}

function guardarUrlPublica(url) {
    try {
        fs.writeFileSync(URL_PUBLICA_FILE, JSON.stringify({
            url: url,
            fecha_actualizacion: new Date().toISOString()
        }, null, 2));
        return true;
    } catch (e) {
        console.error('❌ Error guardando URL:', e.message);
        return false;
    }
}

function obtenerUrlConId() {
    const url = obtenerUrlPublica();
    if (url && ID_FIJO) {
        return `${url}/?id=${ID_FIJO}`;
    }
    return url;
}

// ============================================
// OBTENER IP
// ============================================
async function obtenerIpPublica() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (e) {
        return null;
    }
}

function obtenerIpLocal() {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
        for (const info of iface) {
            if (!info.internal && info.family === 'IPv4') {
                return info.address;
            }
        }
    }
    return '127.0.0.1';
}

// ============================================
// FUNCIONES DE USUARIOS (Chat P2P)
// ============================================
function leerUsuarios() {
    try {
        if (fs.existsSync(USUARIOS_FILE)) {
            const data = fs.readFileSync(USUARIOS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('❌ Error al leer usuarios:', error.message);
    }
    return { usuarios: [] };
}

function guardarUsuarios(data) {
    try {
        if (!data || typeof data !== 'object' || !data.usuarios || !Array.isArray(data.usuarios)) {
            console.error('❌ Data inválida');
            return false;
        }
        fs.writeFileSync(USUARIOS_FILE, JSON.stringify(data, null, 2));
        console.log(`✅ Guardados ${data.usuarios.length} usuarios`);
        return true;
    } catch (error) {
        console.error('❌ Error al guardar usuarios:', error.message);
        return false;
    }
}

// ============================================
// FUNCIONES DEL SERVIDOR PÚBLICO
// ============================================
function getInfoServidor() {
    const ipLocal = obtenerIpLocal();
    return {
        id: ID_FIJO,
        nombre: os.hostname(),
        ip_local: ipLocal,
        puerto: PORT,
        ultima_actualizacion: new Date().toISOString(),
        url: obtenerUrlPublica()
    };
}

async function getInfoServidorCompleto() {
    const ipPublica = await obtenerIpPublica();
    const info = getInfoServidor();
    return {
        ...info,
        ip_publica: ipPublica,
        url: obtenerUrlPublica(),
        url_con_id: obtenerUrlConId()
    };
}

function validarDispositivo(id) {
    try {
        if (fs.existsSync(DISPOSITIVOS_FILE)) {
            const data = JSON.parse(fs.readFileSync(DISPOSITIVOS_FILE, 'utf8'));
            if (data.id_fijo === id) {
                return { valido: true, id: data.id_fijo, nombre: data.hostname, activo: true };
            }
        }
    } catch (e) {}
    return null;
}

// ============================================
// FUNCIÓN DE PROXY
// ============================================
function hacerProxy(req, res) {
    const targetUrl = `http://${TU_IP_LOCAL}:${PUERTO_LOCAL}${req.url}`;
    
    console.log(`🔄 Proxy: ${req.method} ${req.url} → ${targetUrl}`);
    
    // Verificar si el servidor local está activo
    const options = {
        hostname: TU_IP_LOCAL,
        port: PUERTO_LOCAL,
        path: req.url,
        method: req.method,
        headers: req.headers,
        timeout: 5000
    };

    const proxyReq = http.request(options, (proxyRes) => {
        // Reenviar los headers de la respuesta
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
        console.log(`✅ Proxy OK: ${req.url} → ${proxyRes.statusCode}`);
    });

    proxyReq.on('error', (err) => {
        console.error(`❌ Error de proxy: ${req.url} - ${err.message}`);
        
        // Página de error cuando el servidor local no está disponible
        res.status(502).send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><title>🔌 Servidor Local no disponible</title>
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
                .btn-secondary{background:transparent;border:1px solid rgba(16,185,129,0.1);color:#34d399;margin-left:10px;}
                .btn-secondary:hover{background:rgba(16,185,129,0.05);}
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
                        <li>Asegúrate de estar en la misma red que Render</li>
                        <li>IP: <strong>${TU_IP_LOCAL}</strong></li>
                    </div>
                    
                    <div>
                        <button class="btn" onclick="window.location.reload()">🔄 Reintentar</button>
                        <a href="/fijo" class="btn btn-secondary">🔒 ID Fijo</a>
                    </div>
                    
                    <div class="id-fijo">🔒 ID FIJO: ${ID_FIJO || 'Cargando...'}</div>
                    <div class="footer">Grupo GSN · Proxy inverso · ${new Date().toLocaleString()}</div>
                </div>
                <script>
                    setTimeout(() => window.location.reload(), 30000);
                </script>
            </body>
            </html>
        `);
    });

    // Timeout
    proxyReq.on('timeout', () => {
        proxyReq.destroy();
        console.error(`⏱️ Timeout: ${req.url}`);
        res.status(504).send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><title>⏱️ Tiempo de espera agotado</title>
            <style>body{background:#0a0f1c;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;text-align:center;}</style>
            </head>
            <body>
                <div>
                    <h1 style="color:#fbbf24;">⏱️ Tiempo de espera agotado</h1>
                    <p>El servidor local no respondió a tiempo.</p>
                    <button onclick="window.location.reload()" style="padding:12px 30px;background:#10b981;border:none;border-radius:40px;color:white;font-weight:600;cursor:pointer;margin-top:20px;">Reintentar</button>
                </div>
            </body>
            </html>
        `);
    });

    // Si la petición tiene body, enviarlo
    if (req.method === 'POST' || req.method === 'PUT') {
        req.pipe(proxyReq, { end: true });
    } else {
        proxyReq.end();
    }
}

// ============================================
// PROXY PARA TODAS LAS RUTAS
// ============================================

// API
app.use('/api', hacerProxy);

// Páginas principales
app.use('/primogenito', hacerProxy);
app.use('/conductor', hacerProxy);
app.use('/fijo', hacerProxy);
app.use('/madre', hacerProxy);
app.use('/modulos', hacerProxy);
app.use('/static', hacerProxy);
app.use('/templates', hacerProxy);
app.use('/p', hacerProxy);
app.use('/descargar_factura', hacerProxy);

// Cualquier otra ruta
app.use('*', hacerProxy);

// ============================================
// RUTAS DE ESTADO (NO HACEN PROXY)
// ============================================

// Estado del servidor
app.get('/status', (req, res) => {
    const data = leerUsuarios();
    const enLinea = data.usuarios.filter(u => u.peer_id && u.peer_id !== null);
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        total_usuarios: data.usuarios.length,
        usuarios_en_linea: enLinea.length,
        id_fijo: ID_FIJO,
        url_publica: obtenerUrlPublica(),
        proxy: {
            activo: true,
            ip_local: TU_IP_LOCAL,
            puerto_local: PUERTO_LOCAL,
            estado: 'configurado'
        },
        version: '2.0.0'
    });
});

// ID Fijo
app.get('/api/servidor/id', (req, res) => {
    res.json({
        ok: true,
        id: ID_FIJO,
        nombre: os.hostname(),
        url: obtenerUrlPublica()
    });
});

// Validar dispositivo
app.get('/api/servidor/validar/:id', (req, res) => {
    const dispositivo = validarDispositivo(req.params.id);
    if (dispositivo) {
        res.json({
            ok: true,
            valido: true,
            activo: true,
            dispositivo: dispositivo
        });
    } else {
        res.json({
            ok: true,
            valido: false
        });
    }
});

// URL pública
app.get('/api/servidor/url', (req, res) => {
    res.json({
        ok: true,
        url: obtenerUrlPublica(),
        url_con_id: obtenerUrlConId(),
        id: ID_FIJO
    });
});

// Información del servidor
app.get('/api/servidor/info', async (req, res) => {
    try {
        const info = await getInfoServidorCompleto();
        res.json({
            ok: true,
            ...info,
            proxy: {
                activo: true,
                ip_local: TU_IP_LOCAL,
                puerto_local: PUERTO_LOCAL
            }
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ============================================
// ENDPOINTS - USUARIOS (Chat P2P)
// ============================================

app.get('/usuarios', (req, res) => {
    const data = leerUsuarios();
    res.json(data);
});

app.get('/usuarios/:id', (req, res) => {
    const data = leerUsuarios();
    const usuario = data.usuarios.find(u => u.id === req.params.id);
    if (usuario) {
        res.json(usuario);
    } else {
        res.status(404).json({ error: 'Usuario no encontrado' });
    }
});

app.post('/usuarios', (req, res) => {
    const { id, nombre, password, peer_id } = req.body;
    
    if (!id || !nombre) {
        return res.status(400).json({ error: 'Faltan id o nombre' });
    }
    
    let data = leerUsuarios();
    if (!data.usuarios || !Array.isArray(data.usuarios)) {
        data = { usuarios: [] };
    }
    
    const indexExistente = data.usuarios.findIndex(u => u.id === id);
    const existePorNombre = data.usuarios.find(u => u.nombre === nombre && u.id !== id);
    
    if (existePorNombre) {
        return res.status(400).json({ 
            error: `El nombre "${nombre}" ya está en uso`
        });
    }
    
    let usuario;
    if (indexExistente !== -1) {
        usuario = data.usuarios[indexExistente];
        usuario.nombre = nombre;
        if (password) usuario.password = password;
        usuario.peer_id = peer_id || null;
        usuario.ultimo_activo = new Date().toISOString();
        if (!usuario.amigos) usuario.amigos = [];
        if (!usuario.solicitudes) usuario.solicitudes = [];
        if (!usuario.mensajes_pendientes) usuario.mensajes_pendientes = [];
    } else {
        usuario = {
            id: id,
            nombre: nombre,
            password: password || '',
            peer_id: peer_id || null,
            ultimo_activo: new Date().toISOString(),
            amigos: [],
            solicitudes: [],
            mensajes_pendientes: []
        };
        data.usuarios.push(usuario);
    }
    
    if (guardarUsuarios(data)) {
        res.json({ success: true, usuario });
    } else {
        res.status(500).json({ error: 'Error al guardar' });
    }
});

app.put('/usuarios/:id', (req, res) => {
    const { peer_id } = req.body;
    const data = leerUsuarios();
    const usuario = data.usuarios.find(u => u.id === req.params.id);
    if (!usuario) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    usuario.peer_id = peer_id || null;
    usuario.ultimo_activo = new Date().toISOString();
    if (guardarUsuarios(data)) {
        res.json({ success: true, usuario });
    } else {
        res.status(500).json({ error: 'Error al actualizar' });
    }
});

// ============================================
// ENDPOINTS - AMISTADES
// ============================================

app.post('/amistad/solicitar', (req, res) => {
    const { emisorId, receptorId } = req.body;
    const data = leerUsuarios();
    const emisor = data.usuarios.find(u => u.id === emisorId);
    const receptor = data.usuarios.find(u => u.id === receptorId);
    
    if (!emisor || !receptor) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    if (emisor.amigos && emisor.amigos.includes(receptorId)) {
        return res.status(400).json({ error: 'Ya son amigos' });
    }
    
    if (receptor.solicitudes && receptor.solicitudes.includes(emisorId)) {
        return res.status(400).json({ error: 'Solicitud ya enviada' });
    }
    
    if (!receptor.solicitudes) receptor.solicitudes = [];
    if (!receptor.solicitudes.includes(emisorId)) {
        receptor.solicitudes.push(emisorId);
    }
    
    if (guardarUsuarios(data)) {
        res.json({ success: true, message: `Solicitud enviada a ${receptor.nombre}` });
    } else {
        res.status(500).json({ error: 'Error al guardar' });
    }
});

app.post('/amistad/aceptar', (req, res) => {
    const { usuarioId, solicitanteId } = req.body;
    const data = leerUsuarios();
    const usuario = data.usuarios.find(u => u.id === usuarioId);
    const solicitante = data.usuarios.find(u => u.id === solicitanteId);
    
    if (!usuario || !solicitante) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    if (usuario.solicitudes) {
        usuario.solicitudes = usuario.solicitudes.filter(id => id !== solicitanteId);
    }
    
    if (!usuario.amigos) usuario.amigos = [];
    if (!solicitante.amigos) solicitante.amigos = [];
    
    if (!usuario.amigos.includes(solicitanteId)) {
        usuario.amigos.push(solicitanteId);
    }
    if (!solicitante.amigos.includes(usuarioId)) {
        solicitante.amigos.push(usuarioId);
    }
    
    if (guardarUsuarios(data)) {
        res.json({ success: true, message: 'Ahora son amigos' });
    } else {
        res.status(500).json({ error: 'Error al guardar' });
    }
});

app.post('/amistad/rechazar', (req, res) => {
    const { usuarioId, solicitanteId } = req.body;
    const data = leerUsuarios();
    const usuario = data.usuarios.find(u => u.id === usuarioId);
    if (!usuario) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (usuario.solicitudes) {
        usuario.solicitudes = usuario.solicitudes.filter(id => id !== solicitanteId);
    }
    if (guardarUsuarios(data)) {
        res.json({ success: true, message: 'Solicitud rechazada' });
    } else {
        res.status(500).json({ error: 'Error al guardar' });
    }
});

// ============================================
// ENDPOINTS - MENSAJES OFFLINE
// ============================================

app.post('/mensaje/enviar', (req, res) => {
    const { emisorId, receptorId, mensaje } = req.body;
    
    if (!emisorId || !receptorId || !mensaje) {
        return res.status(400).json({ error: 'Faltan datos' });
    }
    
    const data = leerUsuarios();
    const emisor = data.usuarios.find(u => u.id === emisorId);
    const receptor = data.usuarios.find(u => u.id === receptorId);
    
    if (!emisor || !receptor) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    if (!emisor.amigos || !emisor.amigos.includes(receptorId)) {
        return res.status(403).json({ error: 'No son amigos' });
    }
    
    if (!receptor.mensajes_pendientes) receptor.mensajes_pendientes = [];
    receptor.mensajes_pendientes.push({
        de: emisorId,
        de_nombre: emisor.nombre,
        mensaje: mensaje,
        timestamp: new Date().toISOString(),
        leido: false
    });
    
    if (guardarUsuarios(data)) {
        res.json({ 
            success: true, 
            message: 'Mensaje guardado',
            pendientes: receptor.mensajes_pendientes.length
        });
    } else {
        res.status(500).json({ error: 'Error al guardar mensaje' });
    }
});

app.get('/mensaje/pendientes/:id', (req, res) => {
    const id = req.params.id;
    const data = leerUsuarios();
    const usuario = data.usuarios.find(u => u.id === id);
    if (!usuario) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const pendientes = usuario.mensajes_pendientes || [];
    res.json({ pendientes });
});

app.post('/mensaje/leidos', (req, res) => {
    const { usuarioId } = req.body;
    const data = leerUsuarios();
    const usuario = data.usuarios.find(u => u.id === usuarioId);
    if (!usuario) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (usuario.mensajes_pendientes) {
        usuario.mensajes_pendientes = usuario.mensajes_pendientes.filter(m => m.leido === false);
    }
    if (guardarUsuarios(data)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'Error al guardar' });
    }
});

// ============================================
// COMPATIBILIDAD CON CLOUDFLARE
// ============================================

app.get('/api/cloudflare_url', (req, res) => {
    const url = obtenerUrlPublica();
    res.json({
        ok: true,
        activo: url !== null,
        url: url,
        id: ID_FIJO,
        tunel_activo: url !== null,
        mensaje: url ? 'Servidor Público activo' : 'Sin URL pública'
    });
});

app.get('/api/estado_cloudflare', (req, res) => {
    const url = obtenerUrlPublica();
    res.json({
        ok: true,
        activo: url !== null,
        tunel_activo: url !== null,
        url_publica: url,
        id: ID_FIJO,
        mensaje: url ? 'Servidor Público activo' : 'Sin URL pública'
    });
});

app.get('/api/listar_enlaces', (req, res) => {
    const urlPublica = obtenerUrlPublica();
    const urlConId = obtenerUrlConId();
    
    const enlaces = [
        { id: 'local', nombre: 'Enlace Local', url: `http://localhost:${PORT}`, activo: true, tipo: 'local' },
        { id: 'publico', nombre: 'Enlace Público', url: urlPublica, activo: urlPublica !== null, tipo: 'publico' },
        { id: 'fijo', nombre: 'Enlace con ID Fijo', url: urlConId, activo: urlConId !== null, tipo: 'fijo' }
    ];
    
    res.json({ ok: true, enlaces, total: enlaces.length });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

generarIdFijo();
guardarUrlPublica(URL_RENDER);

// Verificar si el servidor local está disponible al iniciar
function verificarServidorLocal() {
    const options = {
        hostname: TU_IP_LOCAL,
        port: PUERTO_LOCAL,
        path: '/',
        method: 'HEAD',
        timeout: 3000
    };
    
    const req = http.request(options, (res) => {
        if (res.statusCode < 400) {
            console.log(`✅ Servidor local disponible en http://${TU_IP_LOCAL}:${PUERTO_LOCAL}`);
        } else {
            console.log(`⚠️ Servidor local responde con código ${res.statusCode}`);
        }
    });
    
    req.on('error', () => {
        console.log(`⚠️ Servidor local NO disponible en http://${TU_IP_LOCAL}:${PUERTO_LOCAL}`);
        console.log(`   🔧 Asegúrate de ejecutar: python main.py`);
    });
    
    req.end();
}

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔒 SERVIDOR PROXY - GRUPO GSN`);
    console.log(`${'='.repeat(60)}`);
    console.log(`   ID FIJO: ${ID_FIJO}`);
    console.log(`   Puerto: ${PORT}`);
    console.log(`   URL Render: ${URL_RENDER}`);
    console.log(`   IP Local del proxy: ${obtenerIpLocal()}`);
    console.log(`\n   📡 PROXY CONFIGURADO:`);
    console.log(`      ${URL_RENDER} → http://${TU_IP_LOCAL}:${PUERTO_LOCAL}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n📱 APPS DISPONIBLES:`);
    console.log(`   📱 Primogénito: ${URL_RENDER}/primogenito`);
    console.log(`   🚛 Conductor:   ${URL_RENDER}/conductor`);
    console.log(`   🔒 ID Fijo:     ${URL_RENDER}/fijo`);
    console.log(`   📊 Dashboard:   ${URL_RENDER}/madre`);
    console.log(`\n${'='.repeat(60)}`);
    
    // Verificar servidor local
    setTimeout(verificarServidorLocal, 2000);
});
