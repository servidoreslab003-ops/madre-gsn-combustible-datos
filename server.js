const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const os = require('os');
const crypto = require('crypto');

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
const SERVIDORES_REGISTRADOS_FILE = path.join(DATA_PATH, 'servidores_registrados.json');

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
// GESTIÓN DE SERVIDORES REGISTRADOS
// ============================================

// Cargar servidores registrados desde archivo
let servidoresRegistrados = {};

function cargarServidoresRegistrados() {
    if (fs.existsSync(SERVIDORES_REGISTRADOS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(SERVIDORES_REGISTRADOS_FILE, 'utf8'));
            servidoresRegistrados = data;
            console.log(`📋 ${Object.keys(servidoresRegistrados).length} servidores registrados cargados`);
            return true;
        } catch (e) {
            console.warn('⚠️ Error cargando servidores registrados:', e.message);
        }
    }
    servidoresRegistrados = {};
    return false;
}

function guardarServidoresRegistrados() {
    try {
        fs.writeFileSync(SERVIDORES_REGISTRADOS_FILE, JSON.stringify(servidoresRegistrados, null, 2));
        console.log(`💾 ${Object.keys(servidoresRegistrados).length} servidores registrados guardados`);
        return true;
    } catch (e) {
        console.error('❌ Error guardando servidores registrados:', e.message);
        return false;
    }
}

// ============================================
// ENDPOINT PARA REGISTRO DE SERVIDORES LOCALES
// ============================================

app.post('/api/servidor/registrar', (req, res) => {
    const { id_fijo, nombre, ip_local, ip_publica, puerto, url } = req.body;
    
    console.log(`📡 Solicitud de registro: ${id_fijo}`);
    
    if (!id_fijo) {
        return res.status(400).json({ 
            ok: false, 
            error: 'id_fijo es requerido' 
        });
    }
    
    // Guardar/Actualizar el servidor
    servidoresRegistrados[id_fijo] = {
        id_fijo,
        nombre: nombre || 'Servidor Local',
        ip_local: ip_local || 'No disponible',
        ip_publica: ip_publica || 'No disponible',
        puerto: puerto || 5000,
        url: url || URL_RENDER,
        ultima_actualizacion: new Date().toISOString(),
        activo: true,
        registrado_desde: servidoresRegistrados[id_fijo]?.registrado_desde || new Date().toISOString()
    };
    
    // Guardar en archivo
    guardarServidoresRegistrados();
    
    console.log(`✅ Servidor registrado: ${id_fijo} (${nombre})`);
    console.log(`   IP Local: ${ip_local}`);
    console.log(`   IP Pública: ${ip_publica}`);
    console.log(`   Total servidores registrados: ${Object.keys(servidoresRegistrados).length}`);
    
    res.json({
        ok: true,
        mensaje: `Servidor ${id_fijo} registrado correctamente`,
        registrado: true,
        total_servidores: Object.keys(servidoresRegistrados).length
    });
});

// ============================================
// ENDPOINTS PARA CONSULTAR SERVIDORES
// ============================================

// Listar todos los servidores registrados
app.get('/api/servidor/listar', (req, res) => {
    // Limpiar servidores inactivos (más de 5 minutos sin actualizar)
    const ahora = new Date();
    for (const [id, servidor] of Object.entries(servidoresRegistrados)) {
        const ultima = new Date(servidor.ultima_actualizacion);
        if ((ahora - ultima) > 300000) { // 5 minutos
            servidor.activo = false;
        }
    }
    
    res.json({
        ok: true,
        servidores: Object.values(servidoresRegistrados),
        total: Object.keys(servidoresRegistrados).length,
        timestamp: new Date().toISOString()
    });
});

// Verificar estado de un servidor específico
app.get('/api/servidor/estado/:id', (req, res) => {
    const id = req.params.id;
    const servidor = servidoresRegistrados[id];
    
    if (servidor) {
        // Verificar si sigue activo
        const ahora = new Date();
        const ultima = new Date(servidor.ultima_actualizacion);
        const activo = (ahora - ultima) < 300000; // 5 minutos
        
        servidor.activo = activo;
        
        if (!activo) {
            guardarServidoresRegistrados();
        }
        
        res.json({
            ok: true,
            activo: activo,
            servidor: servidor,
            mensaje: activo ? 'Servidor activo' : 'Servidor inactivo (timeout)'
        });
    } else {
        res.json({
            ok: true,
            activo: false,
            mensaje: 'Servidor no encontrado'
        });
    }
});

// Mantener vivo el registro (heartbeat)
app.post('/api/servidor/heartbeat', (req, res) => {
    const { id_fijo } = req.body;
    
    if (!id_fijo) {
        return res.status(400).json({ ok: false, error: 'id_fijo requerido' });
    }
    
    if (servidoresRegistrados[id_fijo]) {
        servidoresRegistrados[id_fijo].ultima_actualizacion = new Date().toISOString();
        servidoresRegistrados[id_fijo].activo = true;
        guardarServidoresRegistrados();
        
        res.json({
            ok: true,
            mensaje: `Heartbeat recibido para ${id_fijo}`
        });
    } else {
        res.json({
            ok: false,
            mensaje: `Servidor ${id_fijo} no registrado`
        });
    }
});

// ============================================
// SERVIDOR DE ARCHIVOS ESTÁTICOS
// ============================================

// Servir archivos desde 'combustible/paginas_hijo'
app.use('/paginas_hijo', express.static(PAGINAS_HIJO_PATH));

// Servir archivos desde 'combustible/templates'
app.use('/templates', express.static(TEMPLATES_PATH));

// Servir archivos desde 'combustible' directamente
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
        const urlBase = obtenerUrlPublica();
        const idFijo = ID_FIJO || 'GSN-XXXX';
        
        // Reemplazar API_URL con la URL pública
        html = html.replace(/var API_URL\s*=\s*"";/g, `var API_URL = "${urlBase}";`);
        html = html.replace(/const API_URL\s*=\s*"";/g, `const API_URL = "${urlBase}";`);
        html = html.replace(/let API_URL\s*=\s*"";/g, `let API_URL = "${urlBase}";`);
        
        // Reemplazar ID fijo
        html = html.replace(/ID_FIJO/g, idFijo);
        html = html.replace(/URL_RENDER/g, urlBase);
        
        res.send(html);
        return true;
    } catch (e) {
        console.error(`❌ Error leyendo ${ruta}:`, e.message);
        return false;
    }
}

// ============================================
// RUTA /fijo (Página de ID Fijo)
// ============================================
app.get('/fijo', async (req, res) => {
    try {
        const info = await getInfoServidorCompleto();
        const urlPublica = obtenerUrlPublica();
        const urlConId = obtenerUrlConId();
        
        // Obtener servidores registrados
        const servidoresActivos = Object.values(servidoresRegistrados).filter(s => s.activo);
        
        res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Servidor Fijo - Grupo GSN</title>
        <style>
            *{margin:0;padding:0;box-sizing:border-box;}
            body{font-family:system-ui,sans-serif;background:#0a0f1c;color:#34d399;min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px;}
            .container{max-width:600px;width:100%;background:rgba(10,26,10,0.05);backdrop-filter:blur(30px);border-radius:28px;border:1px solid rgba(16,185,129,0.05);padding:40px 30px;text-align:center;animation:fadeIn 0.5s ease;}
            @keyframes fadeIn{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
            .logo{font-size:3rem;margin-bottom:15px;}
            .badge-fijo{background:rgba(245,158,11,0.1);color:#f59e0b;padding:4px 14px;border-radius:20px;font-size:0.6rem;font-weight:600;border:1px solid rgba(245,158,11,0.1);display:inline-block;margin-bottom:10px;}
            h1{font-size:1.5rem;color:#10b981;margin-bottom:5px;}
            .subtitle{font-size:0.8rem;opacity:0.3;margin-bottom:20px;}
            .id-box{background:rgba(16,185,129,0.05);padding:15px 20px;border-radius:16px;font-family:monospace;font-size:2rem;color:#10b981;letter-spacing:4px;border:2px solid rgba(16,185,129,0.1);margin:15px 0;}
            .id-box .label{font-size:0.6rem;text-transform:uppercase;letter-spacing:2px;color:#34d399;opacity:0.3;display:block;margin-bottom:5px;}
            .id-box .fijo-label{font-size:0.5rem;color:#f59e0b;opacity:0.6;display:block;margin-top:5px;}
            .enlace-publico{background:rgba(16,185,129,0.05);padding:12px 16px;border-radius:12px;border:1px solid rgba(16,185,129,0.1);margin:10px 0;word-break:break-all;}
            .enlace-publico .label{font-size:0.55rem;text-transform:uppercase;letter-spacing:1px;color:#34d399;opacity:0.3;display:block;margin-bottom:4px;}
            .enlace-publico .value{font-size:0.85rem;color:#f59e0b;font-family:monospace;}
            .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0;}
            .grid .item{background:rgba(16,185,129,0.03);padding:12px;border-radius:12px;border:1px solid rgba(16,185,129,0.03);}
            .grid .item .label{font-size:0.55rem;text-transform:uppercase;letter-spacing:1px;color:#34d399;opacity:0.3;}
            .grid .item .value{font-size:0.85rem;font-weight:600;margin-top:4px;color:#10b981;word-break:break-all;}
            .grid .item .value.ip-actual{color:#f59e0b;font-size:0.9rem;}
            .status{display:inline-block;padding:4px 14px;border-radius:20px;font-size:0.7rem;font-weight:600;background:rgba(16,185,129,0.1);color:#34d399;}
            .status.online{background:rgba(16,185,129,0.15);color:#34d399;animation:pulse 2s infinite;}
            @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.6;}}
            .btn{display:inline-block;padding:14px 30px;margin:8px 5px;background:linear-gradient(135deg,#10b981,#059669);border:none;border-radius:40px;color:white;text-decoration:none;font-weight:600;font-size:0.9rem;cursor:pointer;transition:all 0.3s ease;}
            .btn:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(16,185,129,0.3);}
            .btn-secondary{background:transparent;border:1px solid rgba(16,185,129,0.1);color:#34d399;}
            .btn-secondary:hover{background:rgba(16,185,129,0.05);}
            .servidores-area{margin-top:20px;padding-top:20px;border-top:1px solid rgba(16,185,129,0.05);text-align:left;}
            .servidores-area .titulo{font-size:0.7rem;color:rgba(255,255,255,0.3);margin-bottom:10px;}
            .servidor-item{background:rgba(16,185,129,0.03);border-radius:12px;padding:10px 14px;margin-bottom:6px;border:1px solid rgba(16,185,129,0.05);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;}
            .servidor-item .id{font-family:monospace;font-size:0.7rem;color:#10b981;}
            .servidor-item .estado{font-size:0.55rem;padding:2px 10px;border-radius:20px;}
            .servidor-item .estado.activo{background:rgba(16,185,129,0.15);color:#34d399;}
            .servidor-item .estado.inactivo{background:rgba(239,68,68,0.15);color:#f87171;}
            .servidor-item .ip{font-size:0.55rem;color:rgba(255,255,255,0.2);}
            .conectar-area{margin-top:25px;padding-top:25px;border-top:1px solid rgba(16,185,129,0.05);}
            .conectar-area input{width:100%;padding:14px 18px;background:rgba(10,26,10,0.05);border:1px solid rgba(16,185,129,0.05);border-radius:14px;color:#34d399;font-size:1.1rem;text-align:center;font-family:monospace;letter-spacing:2px;margin-bottom:12px;}
            .conectar-area input:focus{outline:none;border-color:rgba(16,185,129,0.1);}
            .conectar-area input::placeholder{color:#34d399;opacity:0.2;}
            .info{margin-top:20px;font-size:0.6rem;color:#34d399;opacity:0.15;}
            .ultima-act{font-size:0.55rem;color:#34d399;opacity:0.2;margin-top:5px;}
            .mensaje-conexion{margin-top:12px;font-size:0.8rem;min-height:20px;color:#fbbf24;}
            .mensaje-conexion.error{color:#f87171;}
            .mensaje-conexion.ok{color:#34d399;}
            .copy-btn{background:rgba(16,185,129,0.05);border:none;color:#34d399;padding:4px 12px;border-radius:8px;cursor:pointer;font-size:0.7rem;margin-left:8px;}
            .copy-btn:hover{background:rgba(16,185,129,0.1);}
            @media(max-width:480px){.container{padding:25px 18px;}.id-box{font-size:1.4rem;}.grid{grid-template-columns:1fr;}}
        </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">🔒</div>
                <div class="badge-fijo">ID FIJO - NUNCA CAMBIA</div>
                <h1>Servidor Fijo</h1>
                <p class="subtitle">Conéctate desde cualquier red usando tu ID</p>
                <div class="id-box"><span class="label">🆔 TU ID FIJO</span>${ID_FIJO}<span class="fijo-label">🔒 Este ID es permanente</span></div>
                <div class="enlace-publico"><span class="label">🌐 ENLACE PÚBLICO (Comparte con otros)</span><div class="value" id="enlacePublico">${urlPublica || 'No disponible'}</div><button class="copy-btn" onclick="copiarEnlace()">📋 Copiar enlace</button></div>
                <div class="enlace-publico" style="border-color:rgba(245,158,11,0.2);"><span class="label">🔗 ENLACE DIRECTO CON TU ID</span><div class="value" id="enlaceDirecto" style="font-size:0.7rem;color:#fbbf24;">${urlConId || 'No disponible'}</div><button class="copy-btn" onclick="copiarEnlaceDirecto()">📋 Copiar</button></div>
                <div><span class="status online">🟢 Servidor activo</span></div>
                <div class="grid">
                    <div class="item"><div class="label">IP Pública Actual</div><div class="value ip-actual" id="ipPublica">${info.ip_publica || 'No disponible'}</div></div>
                    <div class="item"><div class="label">Puerto</div><div class="value">${PORT}</div></div>
                    <div class="item"><div class="label">Estado</div><div class="value" style="color:#34d399;">✅ Activo</div></div>
                    <div class="item"><div class="label">Servidores Registrados</div><div class="value">${Object.keys(servidoresRegistrados).length}</div></div>
                </div>
                
                <div class="servidores-area">
                    <div class="titulo">🖥️ SERVIDORES REGISTRADOS</div>
                    ${servidoresActivos.length === 0 ? '<div style="font-size:0.6rem;color:rgba(255,255,255,0.15);">No hay servidores registrados</div>' : ''}
                    ${servidoresActivos.map(s => `
                        <div class="servidor-item">
                            <span class="id">${s.id_fijo}</span>
                            <span class="estado activo">🟢 Activo</span>
                            <span class="ip">${s.ip_local}</span>
                        </div>
                    `).join('')}
                    ${servidoresActivos.length > 0 ? `<div style="font-size:0.5rem;color:rgba(255,255,255,0.1);margin-top:4px;">Última actualización: ${servidoresActivos[0]?.ultima_actualizacion?.slice(0,19)?.replace('T', ' ') || ''}</div>` : ''}
                </div>
                
                <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
                    <a href="/" class="btn">🏠 Ir al Sistema</a>
                    <a href="/primogenito" class="btn" style="background:linear-gradient(135deg,#3b82f6,#2563eb);">📱 Primogénito</a>
                    <a href="/conductor" class="btn" style="background:linear-gradient(135deg,#10b981,#059669);">🚛 Conductor</a>
                    <button class="btn btn-secondary" onclick="copiarID()">📋 Copiar ID</button>
                </div>
                <div class="conectar-area">
                    <p style="font-size:0.8rem; opacity:0.3; margin-bottom:12px;">🔗 Conectar a otro dispositivo por ID</p>
                    <input type="text" id="idBuscar" placeholder="Ingresa el ID del otro dispositivo" value="">
                    <button class="btn" onclick="conectarPorID()" style="width:100%;">🔗 Conectar</button>
                    <div id="mensajeConexion" class="mensaje-conexion"></div>
                </div>
                <div class="ultima-act">🕐 Última actualización: ${new Date().toISOString().slice(0,19).replace('T', ' ')}</div>
                <div class="info">Grupo GSN - ID Fijo | ${new Date().toISOString().slice(0,19).replace('T', ' ')}</div>
            </div>
            <script>
                function copiarID(){const id="${ID_FIJO}";navigator.clipboard.writeText(id).then(()=>{const btn=event.target;btn.textContent='✅ Copiado!';setTimeout(()=>btn.textContent='📋 Copiar ID',2000);});}
                function copiarEnlace(){const texto=document.getElementById('enlacePublico').textContent;navigator.clipboard.writeText(texto).then(()=>{const btn=event.target;btn.textContent='✅ Copiado!';setTimeout(()=>btn.textContent='📋 Copiar enlace',2000);});}
                function copiarEnlaceDirecto(){const texto=document.getElementById('enlaceDirecto').textContent;navigator.clipboard.writeText(texto).then(()=>{const btn=event.target;btn.textContent='✅ Copiado!';setTimeout(()=>btn.textContent='📋 Copiar',2000);});}
                function conectarPorID(){const input=document.getElementById('idBuscar');const id=input.value.trim().toUpperCase();const msg=document.getElementById('mensajeConexion');if(!id){msg.textContent='⚠️ Ingresa un ID válido';msg.className='mensaje-conexion error';return;}msg.textContent='🔄 Buscando dispositivo...';msg.className='mensaje-conexion';fetch('/api/servidor/estado/'+id).then(res=>res.json()).then(data=>{if(data.ok&&data.activo){msg.innerHTML='✅ Conectado a <strong>'+data.servidor.nombre+'</strong><br>📡 IP: '+data.servidor.ip_local;msg.className='mensaje-conexion ok';}else{msg.textContent='❌ ID no válido o dispositivo inactivo';msg.className='mensaje-conexion error';}}).catch(err=>{msg.textContent='❌ Error: '+err.message;msg.className='mensaje-conexion error';});}
                document.getElementById('idBuscar').addEventListener('keypress',function(e){if(e.key==='Enter')conectarPorID();});
            </script>
        </body>
        </html>
        `);
    } catch (error) {
        res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
    }
});

// ============================================
// RUTA /primogenito - Sirve primogenito.html
// ============================================
app.get('/primogenito', (req, res) => {
    const rutasPosibles = [
        path.join(PAGINAS_HIJO_PATH, 'primogenito.html'),
        path.join(COMBUSTIBLE_PATH, 'paginas_hijo', 'primogenito.html'),
        path.join(BASE_PATH, 'paginas_hijo', 'primogenito.html'),
        path.join(BASE_PATH, 'primogenito.html')
    ];
    
    for (const ruta of rutasPosibles) {
        if (servirHtmlConReemplazos(ruta, res)) {
            console.log(`✅ Sirviendo primogenito desde: ${ruta}`);
            return;
        }
    }
    
    // Fallback: HTML básico
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>📱 Primogénito - Grupo GSN</title><style>body{background:#0a0f1c;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;text-align:center;}</style></head><body><div><h1 style="color:#3b82f6;">📱 Primogénito</h1><p>App de Pedidos Móvil - Grupo GSN</p><p style="color:#f59e0b;">🔒 ID Fijo: ${ID_FIJO}</p><p style="opacity:0.3;font-size:0.8rem;">El archivo primogenito.html no se encontró.</p><div style="margin-top:20px;display:flex;gap:10px;justify-content:center;"><a href="/" style="color:#3b82f6;">🏠 Inicio</a><a href="/fijo" style="color:#f59e0b;">🔒 ID Fijo</a><a href="/conductor" style="color:#10b981;">🚛 Conductor</a></div></div></body></html>`);
});

// ============================================
// RUTA /conductor - Sirve conductor.html
// ============================================
app.get('/conductor', (req, res) => {
    const rutasPosibles = [
        path.join(PAGINAS_HIJO_PATH, 'conductor.html'),
        path.join(COMBUSTIBLE_PATH, 'paginas_hijo', 'conductor.html'),
        path.join(BASE_PATH, 'paginas_hijo', 'conductor.html'),
        path.join(BASE_PATH, 'conductor.html')
    ];
    
    for (const ruta of rutasPosibles) {
        if (servirHtmlConReemplazos(ruta, res)) {
            console.log(`✅ Sirviendo conductor desde: ${ruta}`);
            return;
        }
    }
    
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>🚛 Conductor - Grupo GSN</title><style>body{background:#0a0f1c;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;text-align:center;}</style></head><body><div><h1 style="color:#10b981;">🚛 Conductor</h1><p>App de Rastreo GPS - Grupo GSN</p><p style="color:#f59e0b;">🔒 ID Fijo: ${ID_FIJO}</p><p style="opacity:0.3;font-size:0.8rem;">El archivo conductor.html no se encontró.</p><div style="margin-top:20px;display:flex;gap:10px;justify-content:center;"><a href="/" style="color:#10b981;">🏠 Inicio</a><a href="/fijo" style="color:#f59e0b;">🔒 ID Fijo</a><a href="/primogenito" style="color:#3b82f6;">📱 Primogénito</a></div></div></body></html>`);
});

// ============================================
// RUTA /dashboard - Sirve deepseek_html
// ============================================
app.get('/dashboard', (req, res) => {
    const rutasPosibles = [
        path.join(TEMPLATES_PATH, 'deepseek_html_20260521_cee050.html'),
        path.join(COMBUSTIBLE_PATH, 'templates', 'deepseek_html_20260521_cee050.html'),
        path.join(BASE_PATH, 'deepseek_html_20260521_cee050.html')
    ];
    
    for (const ruta of rutasPosibles) {
        if (servirHtmlConReemplazos(ruta, res)) {
            console.log(`✅ Sirviendo dashboard desde: ${ruta}`);
            return;
        }
    }
    
    res.redirect('/');
});

// ============================================
// RUTA PRINCIPAL
// ============================================
app.get('/', (req, res) => {
    const servidoresActivos = Object.values(servidoresRegistrados).filter(s => s.activo);
    
    res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Grupo GSN - Sistema de Gestión</title>
    <style>
        body{background:#0a0f1c;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;text-align:center;margin:0;padding:20px;}
        .container{max-width:700px;}
        h1{color:#f59e0b;font-size:2.5rem;margin-bottom:10px;}
        .logo{font-size:4rem;margin-bottom:20px;}
        .cards{display:flex;flex-wrap:wrap;gap:15px;justify-content:center;margin:30px 0;}
        .card{background:rgba(255,255,255,0.05);padding:20px 30px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);min-width:150px;text-decoration:none;color:#fff;transition:all 0.3s;}
        .card:hover{transform:translateY(-5px);background:rgba(255,255,255,0.1);}
        .card .icon{font-size:2rem;display:block;margin-bottom:8px;}
        .card .title{font-weight:600;}
        .card.primogenito{border-color:#3b82f6;}
        .card.primogenito:hover{box-shadow:0 0 30px rgba(59,130,246,0.2);}
        .card.conductor{border-color:#10b981;}
        .card.conductor:hover{box-shadow:0 0 30px rgba(16,185,129,0.2);}
        .card.fijo{border-color:#f59e0b;}
        .card.fijo:hover{box-shadow:0 0 30px rgba(245,158,11,0.2);}
        .card.dashboard{border-color:#8b5cf6;}
        .card.dashboard:hover{box-shadow:0 0 30px rgba(139,92,246,0.2);}
        .badge{display:inline-block;padding:4px 16px;border-radius:20px;font-size:0.7rem;font-weight:600;background:rgba(16,185,129,0.1);color:#34d399;margin-top:5px;}
        .id-box{background:rgba(245,158,11,0.05);padding:15px;border-radius:12px;border:1px solid rgba(245,158,11,0.1);margin:20px 0;font-family:monospace;font-size:1.2rem;color:#f59e0b;}
        .servidores-info{font-size:0.7rem;color:rgba(255,255,255,0.2);margin-top:10px;}
        .servidores-info strong{color:#10b981;}
        .version{font-size:0.6rem;color:rgba(255,255,255,0.2);margin-top:20px;}
        .copy-btn{background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);color:#f59e0b;padding:4px 12px;border-radius:20px;cursor:pointer;font-size:0.7rem;margin-left:8px;transition:all 0.2s;}
        .copy-btn:hover{background:rgba(245,158,11,0.2);}
    </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">⛽</div>
            <h1>GRUPO GSN</h1>
            <p style="opacity:0.5;">Sistema de Gestión de Combustible</p>
            <div class="id-box">
                🔒 ID FIJO: ${ID_FIJO}
                <button class="copy-btn" onclick="navigator.clipboard.writeText('${ID_FIJO}')">📋 Copiar</button>
            </div>
            <div class="servidores-info">
                🖥️ Servidores registrados: <strong>${servidoresActivos.length}</strong>
                ${servidoresActivos.length > 0 ? `| Último: <strong>${servidoresActivos[0]?.nombre || ''}</strong>` : ''}
            </div>
            <div class="cards">
                <a href="/dashboard" class="card dashboard">
                    <span class="icon">📊</span>
                    <span class="title">Dashboard</span>
                    <span class="badge">Panel Principal</span>
                </a>
                <a href="/primogenito" class="card primogenito">
                    <span class="icon">📱</span>
                    <span class="title">Primogénito</span>
                    <span class="badge">App de Pedidos</span>
                </a>
                <a href="/conductor" class="card conductor">
                    <span class="icon">🚛</span>
                    <span class="title">Conductor</span>
                    <span class="badge">App de Rastreo</span>
                </a>
                <a href="/fijo" class="card fijo">
                    <span class="icon">🔒</span>
                    <span class="title">Servidor Fijo</span>
                    <span class="badge">ID Permanente</span>
                </a>
            </div>
            <div style="margin-top:10px;font-size:0.7rem;color:rgba(255,255,255,0.15);">
                🌐 URL Pública: ${obtenerUrlPublica()}
            </div>
            <div class="version">Servidor activo • ${new Date().toISOString().slice(0,19).replace('T', ' ')}</div>
        </div>
    </body>
    </html>
    `);
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
// ENDPOINTS - SERVIDOR PÚBLICO (Compatibilidad Python)
// ============================================

app.get('/api/servidor/info', async (req, res) => {
    try {
        const info = await getInfoServidorCompleto();
        res.json({
            ok: true,
            ...info,
            servidores_registrados: Object.keys(servidoresRegistrados).length,
            servidores_activos: Object.values(servidoresRegistrados).filter(s => s.activo).length
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.get('/api/servidor/id', (req, res) => {
    res.json({
        ok: true,
        id: ID_FIJO,
        nombre: os.hostname(),
        url: obtenerUrlPublica()
    });
});

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
        // Buscar en servidores registrados
        const servidor = servidoresRegistrados[req.params.id];
        if (servidor && servidor.activo) {
            res.json({
                ok: true,
                valido: true,
                activo: true,
                dispositivo: servidor
            });
        } else {
            res.json({
                ok: true,
                valido: false
            });
        }
    }
});

app.get('/api/servidor/url', (req, res) => {
    res.json({
        ok: true,
        url: obtenerUrlPublica(),
        url_con_id: obtenerUrlConId(),
        id: ID_FIJO
    });
});

// ============================================
// ENDPOINTS - COMPATIBILIDAD CON CLOUDFLARE
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
        { id: 'fijo', nombre: 'Enlace con ID Fijo', url: urlConId, activo: urlConId !== null, tipo: 'fijo' },
        { id: 'primogenito', nombre: '📱 Primogénito', url: `${urlPublica}/primogenito`, activo: true, tipo: 'app' },
        { id: 'conductor', nombre: '🚛 Conductor', url: `${urlPublica}/conductor`, activo: true, tipo: 'app' },
        { id: 'dashboard', nombre: '📊 Dashboard', url: `${urlPublica}/dashboard`, activo: true, tipo: 'app' }
    ];
    
    res.json({ ok: true, enlaces, total: enlaces.length });
});

// ============================================
// ENDPOINTS - ESTADO
// ============================================

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
        servidores_registrados: Object.keys(servidoresRegistrados).length,
        servidores_activos: Object.values(servidoresRegistrados).filter(s => s.activo).length,
        version: '2.0.0'
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

// Generar ID Fijo
generarIdFijo();

// Cargar servidores registrados
cargarServidoresRegistrados();

// Guardar URL pública
guardarUrlPublica(URL_RENDER);

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔒 SERVIDOR PÚBLICO - GRUPO GSN (Node.js)`);
    console.log(`${'='.repeat(60)}`);
    console.log(`   ID FIJO: ${ID_FIJO}`);
    console.log(`   Puerto: ${PORT}`);
    console.log(`   URL Render: ${URL_RENDER}`);
    console.log(`   IP Local: ${obtenerIpLocal()}`);
    console.log(`   Servidores Registrados: ${Object.keys(servidoresRegistrados).length}`);
    console.log(`${'='.repeat(60)}`);
    
    console.log(`\n📄 GET  /               - Página principal`);
    console.log(`🔒 GET  /fijo            - Página del ID Fijo`);
    console.log(`📱 GET  /primogenito     - App de Pedidos`);
    console.log(`🚛 GET  /conductor       - App de Rastreo`);
    console.log(`📊 GET  /dashboard       - Dashboard principal`);
    console.log(`📄 GET  /paginas_hijo/   - Archivos estáticos`);
    console.log(`📄 GET  /templates/      - Templates`);
    
    console.log(`\n📡 ENDPOINTS DE REGISTRO:`);
    console.log(`   POST /api/servidor/registrar  - Registrar servidor local`);
    console.log(`   GET  /api/servidor/listar     - Listar servidores`);
    console.log(`   GET  /api/servidor/estado/:id - Estado de servidor`);
    console.log(`   POST /api/servidor/heartbeat  - Mantener activo`);
    
    console.log(`\n📄 GET  /usuarios`);
    console.log(`📝 POST /usuarios`);
    console.log(`✏️ PUT  /usuarios/:id`);
    console.log(`🤝 POST /amistad/solicitar`);
    console.log(`✅ POST /amistad/aceptar`);
    console.log(`❌ POST /amistad/rechazar`);
    console.log(`💬 POST /mensaje/enviar`);
    console.log(`📩 GET  /mensaje/pendientes/:id`);
    console.log(`📖 POST /mensaje/leidos`);
    
    console.log(`\n🔒 GET  /api/servidor/info`);
    console.log(`🔒 GET  /api/servidor/id`);
    console.log(`🔒 GET  /api/servidor/validar/:id`);
    console.log(`🔒 GET  /api/servidor/url`);
    console.log(`📊 GET  /status`);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Servidor listo!`);
    console.log(`\n💡 Para que main.py se registre automáticamente:`);
    console.log(`   Asegúrate de que servidor_publico.py tenga:`);
    console.log(`   def registrar_en_render(): ...`);
    console.log(`   y que main.py llame a registrar_en_render()`);
    console.log(`${'='.repeat(60)}`);
});
