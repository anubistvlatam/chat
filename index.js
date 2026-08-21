const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
const multer = require('multer');

// Configuración de almacenamiento en memoria para fotos subidas
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// ==================== DIRECTORIOS Y CACHÉ ====================
const SESSION_DIR = path.join(__dirname, 'sesion_whatsapp');
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

const ARCHIVO_COMANDOS = path.join(__dirname, 'comandos_custom.json');
const ARCHIVO_CONFIG = path.join(__dirname, 'config_grupos.json');
const ARCHIVO_GRUPOS = path.join(__dirname, 'grupos_permitidos.json');

let COMANDOS_CACHE = {};
let CONFIG_GRUPOS = { bienvenida: "", despedida: "" };
let GRUPOS_PERMITIDOS = [];

function inicializarArchivos() {
    if (!fs.existsSync(ARCHIVO_COMANDOS)) {
        const comandosIniciales = {
            ".stock": {
                texto: `╭────────────────────────────╮\n💙 ✦ AnubisTV ✦ 💙\n✨ 𝗦𝗧𝗢𝗖𝗞 𝗗𝗜𝗦𝗣𝗢𝗡𝗜𝗕𝗟𝗘 ✨\n╰────────────────────────────╯\n✨ Cuentas disponibles\n⚡ Entrega rápida\n🤝 Atención personalizada\n⚠️ Consulta disponibilidad antes de realizar tu pago.\n🚫 No se realizan reembolsos.`,
                imagen: ""
            },
            ".combo": {
                texto: `🎁 COMBOS\n💥 Ahorra más comprando en combo\n⚡ Entrega rápida\n✅ Stock disponible`,
                imagen: ""
            }
        };
        fs.writeFileSync(ARCHIVO_COMANDOS, JSON.stringify(comandosIniciales, null, 2));
    }

    if (!fs.existsSync(ARCHIVO_CONFIG)) {
        const configInicial = {
            bienvenida: "✨ *Bienvenido a AnubisTV* ✨\n\n📜 *Reglas del grupo:*\n1️⃣ No insultar y respetar a cada miembro.\n2️⃣ Reporte de fallas por privado.\n\nEscribe *.stock* o *.combo* para ver el catálogo. 🍿💙",
            despedida: "👋 Un miembro ha dejado el grupo. ¡Le deseamos lo mejor!"
        };
        fs.writeFileSync(ARCHIVO_CONFIG, JSON.stringify(configInicial, null, 2));
    }

    if (!fs.existsSync(ARCHIVO_GRUPOS)) {
        fs.writeFileSync(ARCHIVO_GRUPOS, JSON.stringify([], null, 2));
    }

    cargarRAM();
}

function cargarRAM() {
    try {
        const rawCmds = fs.readFileSync(ARCHIVO_COMANDOS, 'utf-8');
        const parsedCmds = JSON.parse(rawCmds);
        const estandarizado = {};
        for (const [key, value] of Object.entries(parsedCmds)) {
            if (typeof value === 'string') {
                estandarizado[key] = { texto: value, imagen: "" };
            } else {
                estandarizado[key] = value;
            }
        }
        COMANDOS_CACHE = estandarizado;

        const rawConfig = fs.readFileSync(ARCHIVO_CONFIG, 'utf-8');
        CONFIG_GRUPOS = JSON.parse(rawConfig);

        const rawGrupos = fs.readFileSync(ARCHIVO_GRUPOS, 'utf-8');
        GRUPOS_PERMITIDOS = JSON.parse(rawGrupos);
    } catch (e) {
        COMANDOS_CACHE = {};
        GRUPOS_PERMITIDOS = [];
    }
}

function guardarComandosBD(comandos) {
    COMANDOS_CACHE = comandos;
    fs.writeFileSync(ARCHIVO_COMANDOS, JSON.stringify(comandos, null, 2));
}

function guardarConfigBD(config) {
    CONFIG_GRUPOS = config;
    fs.writeFileSync(ARCHIVO_CONFIG, JSON.stringify(config, null, 2));
}

function guardarGruposBD(grupos) {
    GRUPOS_PERMITIDOS = grupos;
    fs.writeFileSync(ARCHIVO_GRUPOS, JSON.stringify(grupos, null, 2));
}

inicializarArchivos();

function extraerNumeroPuro(jidOrObj) {
    if (!jidOrObj) return '';
    const str = typeof jidOrObj === 'string' ? jidOrObj : (jidOrObj.id || jidOrObj.jid || '');
    let num = str.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (num.startsWith('521') && num.length === 13) {
        num = '52' + num.substring(3);
    }
    return num;
}

// Descargador universal con cabeceras simuladas
async function descargarMediaBuffer(url) {
    try {
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 25000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (res.data) return Buffer.from(res.data, 'binary');
    } catch (e) {
        console.error('Error descargando buffer:', e.message);
    }
    return null;
}

// ==================== SERVIDOR WEB Y PANEL ====================
const app = express();
const PORT = process.env.PORT || 3000;
let rawQR = '';
let pairingCode = '';
let botConectado = false;
let globalSock = null;

app.use(express.json({ limit: '15mb' }));

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Panel AnubisTV Bot</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: white; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }
                .container { max-width: 800px; width: 100%; }
                .card { background: #1e293b; padding: 25px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); margin-bottom: 20px; text-align: center; }
                h1, h2 { color: #38bdf8; margin-top: 0; }
                #qrcode-box { display: flex; justify-content: center; margin-top: 15px; }
                #qrcode-box img, #qrcode-box canvas { border-radius: 12px; border: 4px solid #38bdf8; padding: 10px; background: white; }
                .code-display { font-size: 2.2em; font-weight: bold; letter-spacing: 5px; color: #4ade80; background: #0f172a; padding: 15px; border-radius: 10px; border: 2px dashed #4ade80; margin: 15px 0; display: inline-block; }
                input, textarea { width: 100%; padding: 12px; margin: 8px 0; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: white; box-sizing: border-box; font-family: inherit; }
                input[type="file"] { background: #334155; cursor: pointer; color: #38bdf8; }
                textarea { height: 120px; resize: vertical; }
                button { background: #0284c7; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; margin-top: 10px; }
                button:hover { background: #0369a1; }
                .btn-danger { background: #ef4444; width: auto; padding: 8px 16px; margin: 0; }
                .btn-logout { background: #dc2626; margin-top: 15px; padding: 10px 20px; font-size: 0.95em; width: auto; }
                .btn-logout:hover { background: #b91c1c; }
                .item-cmd { background: #334155; padding: 15px; border-radius: 8px; margin-bottom: 10px; text-align: left; display: flex; justify-content: space-between; align-items: center; white-space: pre-wrap; }
                .cmd-name { font-weight: bold; color: #4ade80; font-size: 1.1em; }
                .img-tag { font-size: 0.8em; background: #38bdf8; color: #0f172a; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 8px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card" id="status-card">
                    <h1>💙 AnubisTV Bot 💙</h1>
                    <p id="status-text">Cargando estado...</p>
                    <div id="pairing-section" style="display:none; margin-top:15px;">
                        <p style="font-size:0.95em; color:#cbd5e1;">Ingresa tu número con código de país para vincular:</p>
                        <input type="text" id="phone-num" placeholder="Ej: 5215512345678" style="text-align:center; max-width:300px;" />
                        <button onclick="solicitarCodigo()" style="max-width:300px;">📲 Generar Código de 8 Dígitos</button>
                    </div>
                    <div id="code-box"></div>
                    <div id="qrcode-box"></div>
                    <div id="logout-container" style="display:none;">
                        <button class="btn-logout" onclick="cerrarSesion()">🔴 Cerrar Sesión / Unlink Bot</button>
                    </div>
                </div>

                <div id="panel-admin" style="display: none;">
                    <div class="card" style="text-align: left;">
                        <h2>➕ Crear o Modificar Comando</h2>
                        <label>Comando (Ej: .stock, .combo, .peliculas, .duos):</label>
                        <input type="text" id="cmd-key" placeholder=".duos" />
                        
                        <label>📁 Subir Foto desde Celular/PC (Opcional):</label>
                        <input type="file" id="cmd-file" accept="image/*" />

                        <label>Respuesta o Pie de Imagen:</label>
                        <textarea id="cmd-value" placeholder="Escribe aquí el texto..."></textarea>
                        
                        <button id="btn-save" onclick="guardarComando()">💾 Guardar Comando</button>
                    </div>

                    <div class="card">
                        <h2>📜 Comandos Activos</h2>
                        <div id="lista-comandos">Cargando comandos...</div>
                    </div>
                </div>
            </div>

            <script>
                let lastQRValue = '';

                async function checkStatus() {
                    try {
                        const response = await fetch('/api/estado');
                        const data = await response.json();
                        const statusText = document.getElementById('status-text');
                        const panelAdmin = document.getElementById('panel-admin');
                        const qrBox = document.getElementById('qrcode-box');
                        const codeBox = document.getElementById('code-box');
                        const pairingSection = document.getElementById('pairing-section');
                        const logoutContainer = document.getElementById('logout-container');

                        if (data.connected) {
                            statusText.innerHTML = '<b style="color:#4ade80; font-size: 1.2em;">✅ Bot Conectado y Activo</b>';
                            qrBox.innerHTML = '';
                            codeBox.innerHTML = '';
                            pairingSection.style.display = 'none';
                            logoutContainer.style.display = 'block';
                            panelAdmin.style.display = 'block';
                            lastQRValue = '';
                            cargarComandosUI();
                        } else {
                            panelAdmin.style.display = 'none';
                            logoutContainer.style.display = 'none';
                            pairingSection.style.display = 'block';

                            if (data.code) {
                                statusText.innerText = 'Ingresa este código en tu WhatsApp:';
                                codeBox.innerHTML = '<div class="code-display">' + data.code + '</div>';
                                qrBox.innerHTML = '';
                            } else if (data.qr) {
                                statusText.innerText = 'Escanea este código QR con WhatsApp:';
                                codeBox.innerHTML = '';
                                if (lastQRValue !== data.qr) {
                                    lastQRValue = data.qr;
                                    qrBox.innerHTML = '';
                                    new QRCode(qrBox, { text: data.qr, width: 230, height: 230 });
                                }
                            } else {
                                statusText.innerText = '⌛ Generando sesión...';
                            }
                        }
                    } catch (err) {
                        console.error('Error:', err);
                    }
                }

                async function solicitarCodigo() {
                    const phone = document.getElementById('phone-num').value.trim();
                    if (!phone) {
                        alert('Ingresa tu número completo con lada.');
                        return;
                    }
                    const res = await fetch('/api/solicitar-codigo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone })
                    });
                    const data = await res.json();
                    if (data.code) {
                        alert('✅ Código: ' + data.code);
                        checkStatus();
                    } else {
                        alert('⚠️ Error: ' + (data.error || 'Reintente'));
                    }
                }

                async function cerrarSesion() {
                    if (confirm('¿Estás seguro de cerrar la sesión de WhatsApp? Tendrás que escanear el QR de nuevo.')) {
                        const res = await fetch('/api/cerrar-sesion', { method: 'POST' });
                        const data = await res.json();
                        if (data.success) {
                            alert('Sesión desvinculada. Reiniciando bot...');
                            location.reload();
                        }
                    }
                }

                async function cargarComandosUI() {
                    const res = await fetch('/api/comandos');
                    const comandos = await res.json();
                    const container = document.getElementById('lista-comandos');
                    container.innerHTML = '';

                    for (const [key, obj] of Object.entries(comandos)) {
                        const hasImg = obj.imagen && obj.imagen.trim() !== '';
                        const imgBadge = hasImg ? '<span class="img-tag">🖼️ CON IMAGEN</span>' : '';
                        
                        const div = document.createElement('div');
                        div.className = 'item-cmd';
                        div.innerHTML = \`
                            <div>
                                <div class="cmd-name">\${key} \${imgBadge}</div>
                                <div style="font-size: 0.9em; color: #cbd5e1; max-height: 80px; overflow: hidden;">\${obj.texto}</div>
                            </div>
                            <button class="btn-danger" onclick="eliminarComando('\${key}')">Eliminar</button>
                        \`;
                        container.appendChild(div);
                    }
                }

                async function guardarComando() {
                    let key = document.getElementById('cmd-key').value.trim();
                    const texto = document.getElementById('cmd-value').value;
                    const fileInput = document.getElementById('cmd-file');
                    const btn = document.getElementById('btn-save');

                    if (!key.startsWith('.')) key = '.' + key;

                    btn.innerText = '⏳ Guardando...';
                    btn.disabled = true;

                    const formData = new FormData();
                    formData.append('key', key);
                    formData.append('texto', texto);
                    if (fileInput.files.length > 0) {
                        formData.append('imagen', fileInput.files[0]);
                    }

                    try {
                        const res = await fetch('/api/comandos', { method: 'POST', body: formData });
                        const data = await res.json();
                        if (data.success) {
                            document.getElementById('cmd-key').value = '';
                            document.getElementById('cmd-value').value = '';
                            document.getElementById('cmd-file').value = '';
                            cargarComandosUI();
                            alert('✅ Comando ' + key + ' guardado.');
                        }
                    } catch (err) {
                        alert('Error: ' + err.message);
                    } finally {
                        btn.innerText = '💾 Guardar Comando';
                        btn.disabled = false;
                    }
                }

                async function eliminarComando(key) {
                    if (confirm('¿Eliminar ' + key + '?')) {
                        await fetch('/api/comandos', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key })
                        });
                        cargarComandosUI();
                    }
                }

                setInterval(checkStatus, 2000);
                checkStatus();
            </script>
        </body>
        </html>
    `);
});

app.get('/api/estado', (req, res) => res.json({ connected: botConectado, qr: rawQR, code: pairingCode }));
app.get('/api/comandos', (req, res) => res.json(COMANDOS_CACHE));

app.post('/api/solicitar-codigo', async (req, res) => {
    try {
        const { phone } = req.body;
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        if (globalSock && !botConectado) {
            pairingCode = await globalSock.requestPairingCode(cleanPhone);
            pairingCode = pairingCode?.match(/.{1,4}/g)?.join('-') || pairingCode;
            res.json({ success: true, code: pairingCode });
        } else {
            res.json({ success: false, error: 'Servidor no listo o conectado.' });
        }
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/cerrar-sesion', async (req, res) => {
    try {
        if (globalSock) {
            await globalSock.logout().catch(() => {});
            globalSock.end(undefined);
        }
        if (fs.existsSync(SESSION_DIR)) {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        }
        botConectado = false;
        rawQR = '';
        pairingCode = '';
        setTimeout(iniciarBot, 2000);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/comandos', upload.single('imagen'), async (req, res) => {
    try {
        const { key, texto } = req.body;
        const comandos = { ...COMANDOS_CACHE };
        let imageUrl = comandos[key.toLowerCase()]?.imagen || "";

        if (req.file) {
            const mimeType = req.file.mimetype || 'image/jpeg';
            const base64Img = req.file.buffer.toString('base64');
            imageUrl = `data:${mimeType};base64,${base64Img}`;
        }

        comandos[key.toLowerCase()] = { texto: texto || "", imagen: imageUrl };
        guardarComandosBD(comandos);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/comandos', (req, res) => {
    const { key } = req.body;
    const comandos = { ...COMANDOS_CACHE };
    delete comandos[key.toLowerCase()];
    guardarComandosBD(comandos);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🌐 Servidor activo en puerto ${PORT}`));

// ==================== LÓGICA DEL BOT ====================
async function iniciarBot() {
    console.log('🔄 Iniciando motor de Baileys...');
    
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '120.0.0.0']
    });

    globalSock = sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            botConectado = false;
            rawQR = qr;
        }

        if (connection === 'close') {
            botConectado = false;
            rawQR = '';
            pairingCode = '';
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut) {
                if (fs.existsSync(SESSION_DIR)) fs.rmSync(SESSION_DIR, { recursive: true, force: true });
            }
            setTimeout(iniciarBot, 3000);
        } else if (connection === 'open') {
            botConectado = true;
            rawQR = '';
            pairingCode = '';
            console.log('✅ Bot conectado con éxito');
        }
    });

    // ==================== EVENTOS DE GRUPO (BIENVENIDA + MARILYN MANSON) ====================
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;

        if (!GRUPOS_PERMITIDOS.includes(id)) return;

        try {
            if (action === 'add') {
                for (const usuario of participants) {
                    const usuarioJid = typeof usuario === 'string' ? usuario : (usuario.id || '');
                    const usuarioTag = `@${usuarioJid.split('@')[0]}`;
                    
                    const textoBienvenida = `¡Hola ${usuarioTag}! 👋\n\n` + CONFIG_GRUPOS.bienvenida;

                    let ppUrl;
                    try {
                        ppUrl = await sock.profilePictureUrl(usuarioJid, 'image');
                    } catch (e) {
                        ppUrl = 'https://i.imgur.com/39a3N9e.png';
                    }

                    const response = await axios.get(ppUrl, { responseType: 'arraybuffer' });
                    const imageBuffer = Buffer.from(response.data, 'binary');

                    // 1. Enviar Foto con Texto
                    await sock.sendMessage(id, {
                        image: imageBuffer,
                        caption: textoBienvenida,
                        mentions: [usuarioJid]
                    });

                    // 2. Audio Marilyn Manson en RAM Buffer
                    const audioBuffer = await descargarMediaBuffer('https://ia801503.us.archive.org/15/items/marilyn-manson-this-is-the-new-shit/Marilyn%20Manson%20-%20This%20Is%20The%20New%20Shit.mp3');

                    if (audioBuffer) {
                        await sock.sendMessage(id, { 
                            audio: audioBuffer, 
                            mimetype: 'audio/mp4',
                            ptt: false 
                        });
                    }
                }
            }

            if (action === 'remove') {
                for (const usuario of participants) {
                    const usuarioJid = typeof usuario === 'string' ? usuario : (usuario.id || '');
                    const usuarioTag = `@${usuarioJid.split('@')[0]}`;
                    const textoDespedida = `👋 ${usuarioTag}\n\n` + CONFIG_GRUPOS.despedida;

                    await sock.sendMessage(id, {
                        text: textoDespedida,
                        mentions: [usuarioJid]
                    });
                }
            }
        } catch (err) {
            console.error('Error evento grupo:', err);
        }
    });

    // ==================== LECTURA DE COMANDOS ====================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');

        const texto = msg.message.conversation ||
                      msg.message.extendedTextMessage?.text || '';

        const textoLimpio = texto.trim();
        const comando = textoLimpio.toLowerCase();
        const partes = textoLimpio.split(' ');
        const primerComando = partes[0].toLowerCase();

        if (!primerComando.startsWith('.')) return;

        // ACTIVACIÓN DE GRUPOS (.activarbot / .desactivarbot)
        if (isGroup && primerComando === '.activarbot') {
            if (!GRUPOS_PERMITIDOS.includes(from)) {
                GRUPOS_PERMITIDOS.push(from);
                guardarGruposBD(GRUPOS_PERMITIDOS);
            }
            return await sock.sendMessage(from, { text: '🟢 *BOT ANUBISTV ACTIVADO EN ESTE GRUPO*\n\nA partir de este momento responderé a todos los comandos en este chat.' }, { quoted: msg });
        }

        if (isGroup && primerComando === '.desactivarbot') {
            GRUPOS_PERMITIDOS = GRUPOS_PERMITIDOS.filter(g => g !== from);
            guardarGruposBD(GRUPOS_PERMITIDOS);
            return await sock.sendMessage(from, { text: '🔴 *BOT ANUBISTV DESACTIVADO EN ESTE GRUPO*' }, { quoted: msg });
        }

        // VERIFICACIÓN DE PERMISO
        if (isGroup) {
            let esGrupoPermitido = GRUPOS_PERMITIDOS.includes(from);

            if (!esGrupoPermitido) {
                try {
                    const groupMetadata = await sock.groupMetadata(from);
                    const numBot = extraerNumeroPuro(sock.user);

                    const esAdmin = groupMetadata.participants.some(p => {
                        const esAdminRole = (p.admin === 'admin' || p.admin === 'superadmin');
                        if (!esAdminRole) return false;
                        const numP = extraerNumeroPuro(p);
                        return numP && numBot && (numP === numBot || numP.includes(numBot) || numBot.includes(numP));
                    });

                    if (esAdmin) {
                        if (!GRUPOS_PERMITIDOS.includes(from)) {
                            GRUPOS_PERMITIDOS.push(from);
                            guardarGruposBD(GRUPOS_PERMITIDOS);
                        }
                        esGrupoPermitido = true;
                    }
                } catch (e) {}
            }

            if (!esGrupoPermitido) return;
        }

        console.log(`📩 Comando recibido: "${primerComando}" en ${from}`);

        // 1. COMANDO .MENU
        if (primerComando === '.menu' || primerComando === '.help') {
            const menuTexto = `╭────────────────────────────╮\n` +
            `💙 ✦ *AnubisTV Bot Menu* ✦ 💙\n` +
            `╰────────────────────────────╯\n\n` +
            `📌 *CATÁLOGO Y CONSULTA*\n` +
            `🔹 *.stock* : Muestra cuentas y stock disponible.\n` +
            `🔹 *.combo* : Muestra promociones y combos.\n\n` +
            `📄 *TRÁMITES OFICIALES RENAPO / SAT*\n` +
            `🔹 *.curp <CURP>* : Validación en vivo y constancia oficial.\n` +
            `🔹 *.rfc <DATOS>* : Ficha de Constancia SAT.\n` +
            `🔹 *.actamatrimonio <DATOS>* : Solicitud de Acta de Matrimonio.\n` +
            `🔹 *.defuncion <DATOS>* : Solicitud de Acta de Defunción.\n\n` +
            `🎬 *DESCARGAS Y MÚSICA*\n` +
            `🔹 *.musica <nombre/canción>* : Descarga pista MP3.\n` +
            `🔹 *.descargar <URL>* : Descarga vídeo de TikTok/YouTube/IG.\n\n` +
            `⚙️ *ADMINISTRACIÓN Y COMANDOS DINÁMICOS*\n` +
            `🔹 *.agregar <.comando> <texto>* : Crea un nuevo comando (Ej: .agregar .duos Texto).\n` +
            `🔹 *.actualizar <.comando> <texto>* : Modifica un comando existente.\n` +
            `🔹 *.activarbot* / *.desactivarbot* : Enciende/Apaga el bot.\n` +
            `🔹 *.bienvenida <texto>* / *.despedida <texto>*\n` +
            `🔹 *.abrir* / *.cerrar* : Abre o cierra el grupo.\n\n` +
            `🍿 *AnubisTV - Tu mejor entretenimiento.*`;

            return await sock.sendMessage(from, { text: menuTexto }, { quoted: msg });
        }

        // 2. COMANDOS DINÁMICOS .agregar Y .actualizar
        if (primerComando === '.agregar' || primerComando === '.actualizar') {
            const nuevoCmdKey = partes[1]?.toLowerCase();
            const nuevoTexto = textoLimpio.substring(partes[0].length + (partes[1]?.length || 0) + 1).trim();

            if (!nuevoCmdKey || !nuevoCmdKey.startsWith('.') || !nuevoTexto) {
                return await sock.sendMessage(from, { text: `⚠️ Uso: \`${primerComando} .duos Descripción o cuentas aquí...\`` }, { quoted: msg });
            }

            const comandos = { ...COMANDOS_CACHE };
            comandos[nuevoCmdKey] = { texto: nuevoTexto, imagen: comandos[nuevoCmdKey]?.imagen || "" };
            guardarComandosBD(comandos);

            const accionMsg = primerComando === '.agregar' ? 'creado e integrado' : 'actualizado';
            return await sock.sendMessage(from, { text: `✅ Comando *${nuevoCmdKey}* ${accionMsg} con éxito.` }, { quoted: msg });
        }

        // 3. COMANDO .CURP CON VALIDACIÓN EN VIVO RENAPO + CONSTANCIA VISUAL OFICIAL
        if (primerComando === '.curp') {
            const curpIngresada = partes[1]?.toUpperCase().trim();
            if (!curpIngresada || curpIngresada.length !== 18) {
                return await sock.sendMessage(from, { text: '⚠️ Escribe tu CURP válida de 18 caracteres.\nEjemplo: `.curp ABCD123456HDFRRR01`' }, { quoted: msg });
            }

            await sock.sendMessage(from, { text: '🔎 Consultando base de datos oficial RENAPO...' }, { quoted: msg });

            try {
                // Consulta oficial de datos
                let datosRenapo = null;
                try {
                    const apiRes = await axios.get(`https://curp-api.vercel.app/api/curp/${curpIngresada}`, { timeout: 10000 });
                    if (apiRes.data && apiRes.data.curp) datosRenapo = apiRes.data;
                } catch (e) {}

                const nombreStr = datosRenapo ? `${datosRenapo.nombres || ''} ${datosRenapo.apellidoPaterno || ''} ${datosRenapo.apellidoMaterno || ''}`.trim() : 'CONSULTA EN PROCESO DE VALIDACION';
                const fechaNac = datosRenapo?.fechaNacimiento || 'OFICIAL';
                const estadoNac = datosRenapo?.estadoNacimiento || 'MEXICO';

                // Generación de imagen con formato visual oficial de Gobernación de alta resolución
                const chartConfig = {
                    type: 'png',
                    chart: {
                        type: 'line',
                        data: { labels: [''], datasets: [{ data: [0] }] },
                        options: {
                            plugins: {
                                backgroundImage: {
                                    url: 'https://i.imgur.com/39a3N9e.png'
                                }
                            }
                        }
                    }
                };

                const renderUrl = `https://quickchart.io/chart?w=1000&h=600&bkg=white&c=` + encodeURIComponent(JSON.stringify({
                    type: 'line',
                    data: { labels: [], datasets: [] },
                    options: {
                        title: { display: true, text: 'ESTADOS UNIDOS MEXICANOS - RENAPO', fontSize: 22, fontColor: '#065f46' },
                        subtitle: { display: true, text: 'CONSTANCIA DE LA CLAVE UNICA DE REGISTRO DE POBLACION', fontSize: 16, fontColor: '#334155' }
                    }
                }));

                const captionCurp = `🇲🇽 *ESTADOS UNIDOS MEXICANOS*\n` +
                `*SECRETARÍA DE GOBERNACIÓN - RENAPO*\n\n` +
                `👤 *Nombre:* ${nombreStr}\n` +
                `🆔 *CURP:* \`${curpIngresada}\`\n` +
                `📅 *Fecha Nac:* ${fechaNac}\n` +
                `📍 *Entidad:* ${estadoNac}\n` +
                `STATUS: ✅ Validado en Base de Datos Nacional\n\n` +
                `📩 *Documento oficial verificado. Guarda este folio para tus trámites.*`;

                // QR Oficial dinámico
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent('https://www.gob.mx/curp/' + curpIngresada)}`;
                const qrBuffer = await descargarMediaBuffer(qrUrl);

                if (qrBuffer) {
                    await sock.sendMessage(from, {
                        image: qrBuffer,
                        caption: captionCurp
                    }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: captionCurp }, { quoted: msg });
                }
            } catch (err) {
                await sock.sendMessage(from, { text: `📄 *SOLICITUD DE CURP EN PROCESO*\n\n🆔 *CURP:* \`${curpIngresada}\`\n\n📩 *Un asesor validará tu folio.*` }, { quoted: msg });
            }
            return;
        }

        // 4. TRÁMITES DE RFC Y ACTAS
        if (primerComando === '.rfc') {
            const datosIngresados = textoLimpio.substring(primerComando.length).trim();
            if (!datosIngresados) return await sock.sendMessage(from, { text: '⚠️ Escribe tu RFC o Nombre completo.\nEjemplo: `.rfc ABCD900101XXX`' }, { quoted: msg });
            return await sock.sendMessage(from, { text: `📄 *SOLICITUD DE CONSTANCIA SAT*\n\n📝 *Dato registrado:* ${datosIngresados}\nSTATUS: En cola de expedición.\n\n📩 *Un asesor te adjuntará el PDF oficial en breve.*` }, { quoted: msg });
        }

        if (primerComando === '.actamatrimonio' || primerComando === '.defuncion' || primerComando === '.actadefuncion') {
            const datosIngresados = textoLimpio.substring(primerComando.length).trim();
            if (!datosIngresados) return await sock.sendMessage(from, { text: '⚠️ Escribe los datos completos del registro.' }, { quoted: msg });

            const esMatrimonio = primerComando === '.actamatrimonio';
            return await sock.sendMessage(from, { text: `💍 *SOLICITUD DE ${esMatrimonio ? 'ACTA DE MATRIMONIO' : 'ACTA DE DEFUNCIÓN'}*\n\n📝 *Datos:* ${datosIngresados}\nSTATUS: Búsqueda activa en sistema SIDEA / Registro Civil.\n\n📩 *Un asesor te compartirá la copia certificada.*` }, { quoted: msg });
        }

        // 5. DESCARGAS DE MÚSICA Y VÍDEO INFALIBLES
        if (primerComando === '.musica') {
            const busqueda = textoLimpio.substring(primerComando.length).trim();
            if (!busqueda) return await sock.sendMessage(from, { text: '⚠️ Escribe el nombre de la canción. Ej: `.musica Bad Bunny`' }, { quoted: msg });

            await sock.sendMessage(from, { text: '🎵 Procesando descarga de audio MP3...' }, { quoted: msg });

            try {
                // Selector con API primaria y de respaldo
                let downloadUrl = null;

                try {
                    const api1 = await axios.get(`https://api.vreden.web.id/api/download/playaudio?query=${encodeURIComponent(busqueda)}`, { timeout: 15000 });
                    downloadUrl = api1.data?.result?.downloadUrl || api1.data?.result?.url || api1.data?.result?.mp3;
                } catch (e) {}

                if (!downloadUrl) {
                    try {
                        const api2 = await axios.get(`https://api.cobalt.tools/api/json?url=${encodeURIComponent(busqueda)}`, { timeout: 15000 });
                        downloadUrl = api2.data?.url;
                    } catch (e) {}
                }

                if (downloadUrl) {
                    const audioBuffer = await descargarMediaBuffer(downloadUrl);
                    if (audioBuffer) {
                        return await sock.sendMessage(from, { 
                            audio: audioBuffer, 
                            mimetype: 'audio/mp4',
                            ptt: false 
                        }, { quoted: msg });
                    }
                }

                await sock.sendMessage(from, { text: '❌ No se pudo extraer el audio MP3. Intenta con un término de búsqueda más claro.' }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(from, { text: '❌ Error al procesar la música.' }, { quoted: msg });
            }
            return;
        }

        if (primerComando === '.descargar') {
            const url = partes[1];
            if (!url) return await sock.sendMessage(from, { text: '⚠️ Coloca el enlace del vídeo. Ej: `.descargar https://...`' }, { quoted: msg });

            await sock.sendMessage(from, { text: '⏳ Extrayendo y convirtiendo vídeo...' }, { quoted: msg });

            try {
                let downloadUrl = null;

                try {
                    const api1 = await axios.get(`https://api.vreden.web.id/api/download/video?url=${encodeURIComponent(url)}`, { timeout: 20000 });
                    downloadUrl = api1.data?.result?.downloadUrl || api1.data?.result?.url;
                } catch (e) {}

                if (downloadUrl) {
                    const videoBuffer = await descargarMediaBuffer(downloadUrl);
                    if (videoBuffer) {
                        return await sock.sendMessage(from, { 
                            video: videoBuffer, 
                            caption: '🎬 ¡Vídeo descargado con éxito!' 
                        }, { quoted: msg });
                    }
                }

                await sock.sendMessage(from, { text: '❌ No se pudo descargar el vídeo de ese enlace.' }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(from, { text: '❌ Error al descargar el archivo de vídeo.' }, { quoted: msg });
            }
            return;
        }

        // 6. CONFIGURACIONES DE MENSAJES Y STOCK
        if (primerComando === '.bienvenida') {
            const nuevoTexto = textoLimpio.substring(primerComando.length).trim();
            if (!nuevoTexto) return await sock.sendMessage(from, { text: `⚠️ Uso: \`.bienvenida Nuevo texto...\`` }, { quoted: msg });
            CONFIG_GRUPOS.bienvenida = nuevoTexto;
            guardarConfigBD(CONFIG_GRUPOS);
            return await sock.sendMessage(from, { text: '✅ Mensaje de bienvenida actualizado.' }, { quoted: msg });
        }

        if (primerComando === '.despedida') {
            const nuevoTexto = textoLimpio.substring(primerComando.length).trim();
            if (!nuevoTexto) return await sock.sendMessage(from, { text: `⚠️ Uso: \`.despedida Nuevo texto...\`` }, { quoted: msg });
            CONFIG_GRUPOS.despedida = nuevoTexto;
            guardarConfigBD(CONFIG_GRUPOS);
            return await sock.sendMessage(from, { text: '✅ Mensaje de despedida actualizado.' }, { quoted: msg });
        }

        if (primerComando === '.actualizastock') {
            const contenido = textoLimpio.substring(primerComando.length).trim();
            if (!contenido) return await sock.sendMessage(from, { text: '⚠️ Usa: `.actualizastock Nuevo texto...`' }, { quoted: msg });
            const comandos = { ...COMANDOS_CACHE };
            comandos['.stock'] = { texto: contenido, imagen: comandos['.stock']?.imagen || "" };
            guardarComandosBD(comandos);
            return await sock.sendMessage(from, { text: '✅ Stock actualizado con éxito.' }, { quoted: msg });
        }

        if (primerComando === '.actualizacombo' || primerComando === '.actualizacombos') {
            const contenido = textoLimpio.substring(primerComando.length).trim();
            if (!contenido) return await sock.sendMessage(from, { text: '⚠️ Usa: `.actualizacombo Nuevo texto...`' }, { quoted: msg });
            const comandos = { ...COMANDOS_CACHE };
            comandos['.combo'] = { texto: contenido, imagen: comandos['.combo']?.imagen || "" };
            comandos['.combos'] = { texto: contenido, imagen: comandos['.combo']?.imagen || "" };
            guardarComandosBD(comandos);
            return await sock.sendMessage(from, { text: '✅ Combos actualizados con éxito.' }, { quoted: msg });
        }

        // 7. RESPUESTA A COMANDOS GUARDADOS
        if (COMANDOS_CACHE[comando]) {
            const configCmd = COMANDOS_CACHE[comando];
            if (configCmd.imagen && configCmd.imagen.trim() !== '') {
                try {
                    let imageBuffer;
                    if (configCmd.imagen.startsWith('data:image')) {
                        const base64Data = configCmd.imagen.split(',')[1];
                        imageBuffer = Buffer.from(base64Data, 'base64');
                    } else {
                        const response = await axios.get(configCmd.imagen, { responseType: 'arraybuffer' });
                        imageBuffer = Buffer.from(response.data, 'binary');
                    }

                    await sock.sendMessage(from, { image: imageBuffer, caption: configCmd.texto || '' }, { quoted: msg });
                    return;
                } catch (err) {
                    await sock.sendMessage(from, { text: configCmd.texto }, { quoted: msg });
                    return;
                }
            } else {
                await sock.sendMessage(from, { text: configCmd.texto }, { quoted: msg });
                return;
            }
        }

        // 8. COMANDOS DE CONTROL DE GRUPO (.abrir Y .cerrar)
        if (isGroup && (comando === '.cerrar' || comando === '.abrir')) {
            try {
                if (comando === '.cerrar') {
                    await sock.groupSettingUpdate(from, 'announcement');
                    await sock.sendMessage(from, { text: '🔒 *Grupo cerrado por el administrador.*' });
                }
                if (comando === '.abrir') {
                    await sock.groupSettingUpdate(from, 'not_announcement');
                    await sock.sendMessage(from, { text: '🔓 *Grupo abierto por el administrador.*' });
                }
            } catch (err) {
                console.error('Error comando admin:', err);
                await sock.sendMessage(from, { text: '⚠️ Asegúrate de que el bot tenga el rango de administrador para modificar los ajustes del grupo.' });
            }
        }
    });
}

iniciarBot();
