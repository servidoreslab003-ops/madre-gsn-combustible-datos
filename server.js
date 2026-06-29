const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// ============================================
// CONFIGURACIÓN
// ============================================
const USUARIOS_FILE = path.join(__dirname, 'data', 'usuarios.json');
const DISPOSITIVOS_FILE = path.join(__dirname, 'data', 'dispositivos.json');

// Crear carpeta data
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// ============================================
// ID FIJO
// ============================================
let ID_FIJO = null;

function generarIdFijo() {
    // Intentar cargar ID guardado
    if (fs.existsSync(DISPOSITIVOS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(DISPOSITIVOS_FILE, 'utf8'));
            if (data.id_fijo) {
                ID_FIJO = data.id_fijo;
                return ID_FIJO;
            }
        } catch (e) {}
    }

    // Generar nuevo ID
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
        
        // Guardar
        fs.writeFileSync(DISPOSITIVOS_FILE, JSON.stringify({
            id_fijo: ID_FIJO,
            fecha_creacion: new Date().toISOString(),
            hostname: hostname,
            mac: mac
        }, null, 2));
        
        return ID_FIJO;
    } catch (e) {
        ID_FIJO = `GSN-${Math.floor(Math.random() * 90000) + 10000}`;
        return ID_FIJO;
    }
}

// ============================================
// OBTENER IP PÚBLICA
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
// FUNCIONES DE USUARIOS
// ============================================

function leerUsuarios() {
    try {
        if (fs.existsSync(USUARIOS_FILE)) {
            const data = fs.readFileSync(USUARIOS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('❌ Error al leer:', error.message);
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
        console.error('❌ Error al guardar:', error.message);
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
        ultima_actualizacion: new Date().toISOString()
    };
}

async function getInfoServidorCompleto() {
    const ipPublica = await obtenerIpPublica();
    const info = getInfoServidor();
    return {
        ...info,
        ip_publica: ipPublica,
        url: ipPublica ? `http://${ipPublica}:${PORT}` : null,
        url_con_id: ipPublica ? `http://${ipPublica}:${PORT}/?id=${ID_FIJO}` : null
    };
}

function validarDispositivo(id) {
    try {
        if (fs.existsSync(DISPOSITIVOS_FILE)) {
            const data = JSON.parse(fs.readFileSync(DISPOSITIVOS_FILE, 'utf8'));
            if (data.id_fijo === id) {
                return { valido: true, id: data.id_fijo, nombre: data.hostname };
            }
        }
    } catch (e) {}
    return null;
}

// ============================================
// ENDPOINTS - USUARIOS
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
    
    console.log('📝 POST /usuarios:', { id, nombre });
    
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
        console.log(`✏️ Usuario actualizado: ${nombre}`);
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
        console.log(`✅ Nuevo usuario creado: ${nombre}`);
    }
    
    if (guardarUsuarios(data)) {
        res.json({ success: true, usuario });
    } else {
        res.status(500).json({ error: 'Error al guardar' });
    }
});

app.put('/usuarios/:id', (req, res) => {
    const { peer_id } = req.body;
    console.log(`✏️ PUT /usuarios/${req.params.id}: peer_id = ${peer_id}`);
    
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
    console.log(`🤝 Solicitud: ${emisorId} -> ${receptorId}`);
    
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
    console.log(`✅ Aceptar: ${solicitanteId} -> ${usuarioId}`);
    
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
    console.log(`💬 Mensaje offline: ${emisorId} -> ${receptorId}: "${mensaje}"`);
    
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
    
    console.log(`📩 Mensaje guardado para ${receptor.nombre}. Total pendientes: ${receptor.mensajes_pendientes.length}`);
    
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
    console.log(`📩 Consultando mensajes pendientes para: ${id}`);
    
    const data = leerUsuarios();
    const usuario = data.usuarios.find(u => u.id === id);
    if (!usuario) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const pendientes = usuario.mensajes_pendientes || [];
    console.log(`📩 ${pendientes.length} mensajes pendientes para ${usuario.nombre}`);
    res.json({ pendientes });
});

app.post('/mensaje/leidos', (req, res) => {
    const { usuarioId } = req.body;
    console.log(`📖 Marcando mensajes como leídos para: ${usuarioId}`);
    
    const data = leerUsuarios();
    const usuario = data.usuarios.find(u => u.id === usuarioId);
    if (!usuario) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    if (usuario.mensajes_pendientes) {
        const antes = usuario.mensajes_pendientes.length;
        usuario.mensajes_pendientes = usuario.mensajes_pendientes.filter(m => m.leido === false);
        console.log(`📖 Eliminados ${antes - usuario.mensajes_pendientes.length} mensajes leídos`);
    }
    
    if (guardarUsuarios(data)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'Error al guardar' });
    }
});

// ============================================
// ENDPOINTS - SERVIDOR PÚBLICO
// ============================================

app.get('/api/servidor/info', async (req, res) => {
    try {
        const info = await getInfoServidorCompleto();
        res.json({
            ok: true,
            ...info
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.get('/api/servidor/id', (req, res) => {
    res.json({
        ok: true,
        id: ID_FIJO,
        nombre: os.hostname()
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
        res.json({
            ok: true,
            valido: false
        });
    }
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
        id_fijo: ID_FIJO
    });
});

// ============================================
// INICIAR
// ============================================

// Generar ID Fijo al iniciar
generarIdFijo();

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🔒 SERVIDOR PÚBLICO - GRUPO GSN (Node.js)`);
    console.log(`${'='.repeat(50)}`);
    console.log(`   ID FIJO: ${ID_FIJO}`);
    console.log(`   Puerto: ${PORT}`);
    
    const ipPublica = await obtenerIpPublica();
    if (ipPublica) {
        console.log(`   IP Pública: ${ipPublica}`);
        console.log(`   URL Pública: http://${ipPublica}:${PORT}`);
    } else {
        console.log(`   IP Pública: No disponible`);
    }
    console.log(`   IP Local: ${obtenerIpLocal()}`);
    console.log(`${'='.repeat(50)}`);
    
    console.log(`\n📄 GET  /usuarios`);
    console.log(`📝 POST /usuarios`);
    console.log(`✏️ PUT  /usuarios/:id`);
    console.log(`🤝 POST /amistad/solicitar`);
    console.log(`✅ POST /amistad/aceptar`);
    console.log(`❌ POST /amistad/rechazar`);
    console.log(`💬 POST /mensaje/enviar`);
    console.log(`📩 GET  /mensaje/pendientes/:id`);
    console.log(`📖 POST /mensaje/leidos`);
    console.log(`📊 GET  /status`);
    console.log(`🔒 GET  /api/servidor/info`);
    console.log(`🔒 GET  /api/servidor/id`);
    console.log(`🔒 GET  /api/servidor/validar/:id`);
    console.log(`\n✅ Servidor listo!`);
});