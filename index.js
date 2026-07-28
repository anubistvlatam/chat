const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
const multer = require('multer');

// Configuración de carga de archivos en memoria
const upload = multer({ storage: multer.memoryStorage() });

// ==================== DIRECTORIOS ====================
const SESSION_DIR = path.join(__dirname, 'sesion_whatsapp');
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

const ARCHIVO_COMANDOS = path.join(__dirname, 'comandos_custom.json');

if (!fs.existsSync(ARCHIVO_COMANDOS)) {
    const comandosIniciales = {
        ".stock": {
            texto: `╭────────────────────────────╮\n💙 ✦ AnubisTV ✦ 💙\n✨ 𝗦𝗧𝗢𝗖𝗞 𝗗𝗜𝗦𝗣𝗢𝗡𝗜𝗕𝗟𝗘 ✨\n╰────────────────────────────╯\n✨ Cuentas disponibles\n⚡ Entrega rápida\n🤝 Atención personalizada\n⚠️ Consulta disponibilidad antes de realizar tu pago.\n🚫 No se realizan reembolsos.\n\n⋆⋅☆⋅⋆ ✧･ﾟ: 🎬 𝗦𝗧𝗥𝗘𝗔𝗠𝗜𝗡𝗚 :･ﾟ✧ ⋆⋅☆⋅⋆\n❤️ NETFLIX\n▸ 👤 Perfil $55\n▸ 👥 Completa $230\n💙 PRIME VIDEO\n▸ 👤 Perfil $20\n▸ 👥 Completa $45\n🩵 PARAMOUNT+\n▸ 👤 Perfil $17\n▸ 👥 Completa $45\n💙 DISNEY+\n▸ 👤 Perfil $22\n▸ 👥 Completa $70\n💜 MAX PLATINO\n▸ 👤 Perfil $21\n▸ 👥 Completa $55\n🧡 CRUNCHYROLL\n▸ 👤 Perfil $15\n▸ 👥 Completa $45\n🧡 VIX (Mensual)\n▸ 👤 Perfil $11\n▸ 👥 Completa $20\n🧡 VIX (Anual)\n▸ 👤 Perfil $15\n▸ 👥 Completa $30\n\n⋆⋅☆⋅⋆ ✧･ﾟ: 🎵 𝗠𝗨́𝗦𝗜𝗖𝗔 :･ﾟ✧ ⋆⋅☆⋅⋆\n💚 SPOTIFY PREMIUM\n▸ 1 Mes $40\n▸ 3 Meses $85\n❤️ YOUTUBE PREMIUM\n▸ Invitación $25\n▸ Familiar (tus datos) $45\n\n⋆⋅☆⋅⋆ ✧･ﾟ: 🛠️ 𝗔𝗣𝗣𝗦 & 𝗛𝗘𝗥𝗥𝗔𝗠𝗜𝗘𝗡𝗧𝗔𝗦 :･ﾟ✧ ⋆⋅☆⋅⋆\n💜 CANVA PRO\n▸ 1 Mes $25\n▸ 3 Meses $50\n▸ 6 Meses $70\n▸ Anual $90\n💼 MICROSOFT 365\n▸ 1 Mes $25\n▸ 2 Meses $50\n▸ 6 Meses $90\n📦 OTROS SERVICIOS\n🦉 Duolingo $25\n🎧 Deezer $30\n🔞 Pornhub $30`,
            imagen: ""
        },
        ".combo": {
            texto: `🎁 COMBOS\n💥 Ahorra más comprando en combo\n⚡ Entrega rápida\n✅ Stock disponible\n\n🥇 COMBO #1 | Más vendido\n❤️ Netflix\n💜 Max\n🧡 ViX\n💰 Precio: $80\n\n🥈 COMBO #2\n💙 Disney+\n💙 Prime Video\n🧡 Crunchyroll\n💰 Precio: $55\n\n🥉 COMBO #3\n❤️ Netflix\n💙 Disney+\n💙 Prime Video\n💰 Precio: $84\n\n🎬 COMBO #4\n💜 Max\n🩵 Paramount+\n🧡 ViX\n💰 Precio: $45\n\n🍿 COMBO #5\n💙 Disney+\n🩵 Paramount+\n🧡 ViX\n💰 Precio: $45\n\n🔥 COMBO #6\n❤️ Netflix\n💜 Max\n🧡 Crunchyroll\n💰 Precio: $80\n\n🎵 COMBO #7\n💚 Spotify Premium\n❤️ YouTube Premium\n💰 Precio: $70\n\n📺 COMBO #8\n💙 Prime Video\n🩵 Paramount+\n🧡 ViX\n💰 Precio: $43\n\n⭐ COMBO #9\n💙 Disney+\n💜 Max\n🧡 Crunchyroll\n💰 Precio: $55\n\n👑 COMBO #10 | Premium\n❤️ Netflix\n💙 Disney+\n💜 Max\n💙 Prime Video\n💰 Precio: $85\n\n🩵 💫 ANUBISTV 💫🩵 ┊\n🎵 Tidal $30\n👨‍👩‍👧‍👦 Tidal Familiar $45\n🎬 Mubi $30\n👨‍👩‍👧‍👦 Mubi Familiar $40\n🎥 Universal+ $25\n📺 Fox One $25\n🍎 Apple TV $30\n🍎 Apple TV (3 Meses) $50\n\n⋆⋅☆⋅⋆ ✧･ﾟ: 💙 AnubisTV 💙 :･ﾟ✧ ⋆⋅☆⋅⋆\n✨ Calidad • Confianza • Rapidez\n💬 ¡Gracias por tu preferencia!\n\n┊💫 Streaming AnubisTV 💫 ┊`,
            imagen: ""
        }
    };
    fs.writeFileSync(ARCHIVO_COMANDOS, JSON.stringify(comandosIniciales, null, 2));
}

function cargarComandos() {
    try {
        const rawData = fs.readFileSync(ARCHIVO_COMANDOS, 'utf-8');
        const parsed = JSON.parse(rawData);
        const estandarizado = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string') {
                estandarizado[key] = { texto: value, imagen: "" };
            } else {
                estandarizado[key] = value;
            }
        }
        return estandarizado;
    } catch (e) {
        return {};
    }
}

function guardarComandosBD(comandos) {
    fs.writeFileSync(ARCHIVO_COMANDOS, JSON.stringify(comandos, null, 2));
}

// ==================== SERVIDOR WEB ====================
const app = express();
const PORT = process.env.PORT || 3000;
let rawQR = '';
let pairingCode = '';
let botConectado = false;
let globalSock = null;

app.use(express.json());

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
                input[type="file"] { background: #334155; cursor: pointer; color: #38bdf8; font-size: 0.9em; }
                textarea { height: 120px; resize: vertical; }
                button { background: #0284c7; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; margin-top: 10px; }
                button:hover { background: #0369a1; }
                .btn-danger { background: #ef4444; width: auto; padding: 6px 12px; margin: 0; }
                .item-cmd { background: #334155; padding: 15px; border-radius: 8px; margin-bottom: 10px; text-align: left; display: flex; justify-content: space-between; align-items: center; white-space: pre-wrap; }
                .cmd-name { font-weight: bold; color: #4ade80; font-size: 1.1em; }
                .img-tag { font-size: 0.8em; background: #38bdf8; color: #0f172a; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 8px; }
                .separator { margin: 10px 0; font-size: 0.85em; color: #94a3b8; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card" id="status-card">
                    <h1>💙 AnubisTV Bot 💙</h1>
                    <p id="status-text">Cargando estado...</p>
                    <div id="pairing-section" style="display:none; margin-top:15px;">
                        <p style="font-size:0.95em; color:#cbd5e1;">Si el QR no carga, ingresa tu número con código de país para vincular con código:</p>
                        <input type="text" id="phone-num" placeholder="Ej: 5215512345678" style="text-align:center; max-width:300px;" />
                        <button onclick="solicitarCodigo()" style="max-width:300px;">📲 Generar Código de 8 Dígitos</button>
                    </div>
                    <div id="code-box"></div>
                    <div id="qrcode-box"></div>
                </div>

                <div id="panel-admin" style="display: none;">
                    <div class="card" style="text-align: left;">
                        <h2>➕ Crear o Modificar Comando</h2>
                        <label>Comando (ej: .publicidad, .stock, .combo):</label>
                        <input type="text" id="cmd-key" placeholder=".publicidad" />
                        
                        <label>📁 Opción 1: Subir Foto desde Celular/PC (Opcional)</label>
                        <input type="file" id="cmd-file" accept="image/*" />

                        <div class="separator">── O TAMBIÉN ──</div>

                        <label>🔗 Opción 2: O pegar URL de Imagen (Opcional)</label>
                        <input type="text" id="cmd-img-url" placeholder="https://ejemplo.com/imagen.jpg" />

                        <label>Respuesta o Pie de Imagen:</label>
                        <textarea id="cmd-value" placeholder="Escribe aquí el mensaje o pie de imagen..."></textarea>
                        
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

                        if (data.connected) {
                            statusText.innerHTML = '<b style="color:#4ade80; font-size: 1.2em;">✅ Bot Conectado y Activo</b>';
                            qrBox.innerHTML = '';
                            codeBox.innerHTML = '';
                            pairingSection.style.display = 'none';
                            panelAdmin.style.display = 'block';
                            lastQRValue = '';
                            cargarComandosUI();
                        } else {
                            panelAdmin.style.display = 'none';
                            pairingSection.style.display = 'block';

                            if (data.code) {
                                statusText.innerText = 'Ingresa este código en tu WhatsApp (Dispositivos Vinculados):';
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
                                statusText.innerText = '⌛ Generando sesión... Ingrese su número si no carga el QR.';
                            }
                        }
                    } catch (err) {
                        console.error('Error:', err);
                    }
                }

                async function solicitarCodigo() {
                    const phone = document.getElementById('phone-num').value.trim();
                    if (!phone) {
                        alert('Ingresa tu número de WhatsApp con código de país (Ej: 5215512345678)');
                        return;
                    }

                    const res = await fetch('/api/solicitar-codigo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone })
                    });
                    const data = await res.json();
                    if (data.code) {
                        alert('✅ Código generado exitosamente: ' + data.code);
                        checkStatus();
                    } else {
                        alert('⚠️ Error al generar código: ' + (data.error || 'Intente nuevamente'));
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
                                <div style="font-size: 0.9em; color: #cbd5e1; max-height: 80px; overflow: hidden; text-overflow: ellipsis;">\${obj.texto}</div>
                            </div>
                            <button class="btn-danger" onclick="eliminarComando('\${key}')">Eliminar</button>
                        \`;
                        container.appendChild(div);
                    }
                }

                async function guardarComando() {
                    const key = document.getElementById('cmd-key').value.trim();
                    const texto = document.getElementById('cmd-value').value;
                    const urlImg = document.getElementById('cmd-img-url').value.trim();
                    const fileInput = document.getElementById('cmd-file');
                    const btn = document.getElementById('btn-save');

                    if (!key.startsWith('.')) {
                        alert('El comando debe comenzar con punto (.) Ej: .publicidad');
                        return;
                    }
                    if (!texto && fileInput.files.length === 0 && !urlImg) {
                        alert('Escribe un texto o selecciona/pega una imagen.');
                        return;
                    }

                    btn.innerText = '⏳ Guardando comando...';
                    btn.disabled = true;

                    const formData = new FormData();
                    formData.append('key', key);
                    formData.append('texto', texto);
                    formData.append('urlImagen', urlImg);
                    if (fileInput.files.length > 0) {
                        formData.append('imagen', fileInput.files[0]);
                    }

                    try {
                        const res = await fetch('/api/comandos', {
                            method: 'POST',
                            body: formData
                        });
                        const data = await res.json();

                        if (data.success) {
                            document.getElementById('cmd-key').value = '';
                            document.getElementById('cmd-value').value = '';
                            document.getElementById('cmd-img-url').value = '';
                            document.getElementById('cmd-file').value = '';
                            cargarComandosUI();
                            alert('✅ Comando ' + key + ' guardado exitosamente.');
                        } else {
                            alert('⚠️ Error al guardar el comando.');
                        }
                    } catch (err) {
                        alert('Error en la solicitud: ' + err.message);
                    } finally {
                        btn.innerText = '💾 Guardar Comando';
                        btn.disabled = false;
                    }
                }

                async function eliminarComando(key) {
                    if (confirm('¿Seguro que deseas eliminar el comando ' + key + '?')) {
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

app.get('/api/estado', (req, res) => {
    res.json({ connected: botConectado, qr: rawQR, code: pairingCode });
});

app.post('/api/solicitar-codigo', async (req, res) => {
    try {
        const { phone } = req.body;
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        
        if (globalSock && !botConectado) {
            pairingCode = await globalSock.requestPairingCode(cleanPhone);
            pairingCode = pairingCode?.match(/.{1,4}/g)?.join('-') || pairingCode;
            res.json({ success: true, code: pairingCode });
        } else {
            res.json({ success: false, error: 'El servicio no está listo o ya está conectado.' });
        }
    } catch (err) {
        console.error('Error al solicitar código:', err);
        res.json({ success: false, error: err.message });
    }
});

app.get('/api/comandos', (req, res) => {
    res.json(cargarComandos());
});

app.post('/api/comandos', upload.single('imagen'), async (req, res) => {
    try {
        const { key, texto, urlImagen } = req.body;
        const comandos = cargarComandos();
        let imageUrl = urlImagen || comandos[key.toLowerCase()]?.imagen || "";

        // Si se sube archivo directo desde Celular/PC
        if (req.file) {
            const base64Img = req.file.buffer.toString('base64');
            const imgurRes = await axios.post('https://api.imgur.com/3/image', 
                { image: base64Img, type: 'base64' }, 
                { headers: { Authorization: 'Client-ID 13915f79590e8ed' } }
            );
            
            if (imgurRes.data && imgurRes.data.data && imgurRes.data.data.link) {
                imageUrl = imgurRes.data.data.link;
            }
        }

        comandos[key.toLowerCase()] = { texto, imagen: imageUrl };
        guardarComandosBD(comandos);
        res.json({ success: true });
    } catch (err) {
        console.error('Error al subir imagen:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/comandos', (req, res) => {
    const { key } = req.body;
    const comandos = cargarComandos();
    delete comandos[key.toLowerCase()];
    guardarComandosBD(comandos);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🌐 Servidor activo en el puerto ${PORT}`));

// ==================== LÓGICA BOT ====================
async function iniciarBot() {
    console.log('🔄 Iniciando Baileys...');
    
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
            console.log('⚡ QR Generado');
            botConectado = false;
            rawQR = qr;
        }

        if (connection === 'close') {
            botConectado = false;
            rawQR = '';
            pairingCode = '';
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const causaCierreSesion = statusCode === DisconnectReason.loggedOut;

            if (causaCierreSesion) {
                console.log('⚠️ Sesión expirada. Limpiando datos...');
                if (fs.existsSync(SESSION_DIR)) {
                    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
                }
            }
            setTimeout(iniciarBot, 3000);
        } else if (connection === 'open') {
            botConectado = true;
            rawQR = '';
            pairingCode = '';
            console.log('✅ Bot conectado con éxito');
        }
    });

    // Bienvenida
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;

        if (action === 'add') {
            for (const usuarioJid of participants) {
                try {
                    const usuarioTag = `@${usuarioJid.split('@')[0]}`;
                    const mensajeBienvenida = `¡Hola ${usuarioTag}! 👋\n\n` +
                    `✨ *Bienvenido a AnubisTV* ✨\n\n` +
                    `📜 *Reglas del grupo:*\n` +
                    `1️⃣ No insultar y respetar a cada miembro del grupo.\n` +
                    `2️⃣ Si tienen fallas con la cuenta, mandar msj en privado.\n\n` +
                    `Escribe *.stock* o *.combos* para ver nuestro catálogo. 🍿💙`;

                    let ppUrl;
                    try {
                        ppUrl = await sock.profilePictureUrl(usuarioJid, 'image');
                    } catch (e) {
                        ppUrl = 'https://i.imgur.com/39a3N9e.png';
                    }

                    const response = await axios.get(ppUrl, { responseType: 'arraybuffer' });
                    const imageBuffer = Buffer.from(response.data, 'binary');

                    await sock.sendMessage(id, {
                        image: imageBuffer,
                        caption: mensajeBienvenida,
                        mentions: [usuarioJid]
                    });

                } catch (err) {
                    console.error('Error bienvenida:', err);
                }
            }
        }
    });

    // Lectura de Comandos
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        const msg = messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');

        const texto = msg.message.conversation ||
        msg.message.extendedTextMessage?.text || '';

        const comando = texto.trim().toLowerCase();

        const comandosDB = cargarComandos();
        
        if (comandosDB[comando]) {
            const configCmd = comandosDB[comando];

            if (configCmd.imagen && configCmd.imagen.trim() !== '') {
                try {
                    const response = await axios.get(configCmd.imagen, { responseType: 'arraybuffer' });
                    const imageBuffer = Buffer.from(response.data, 'binary');

                    await sock.sendMessage(from, {
                        image: imageBuffer,
                        caption: configCmd.texto || ''
                    }, { quoted: msg });
                    return;
                } catch (err) {
                    console.error('Error enviando imagen:', err.message);
                    await sock.sendMessage(from, { text: configCmd.texto }, { quoted: msg });
                    return;
                }
            } else {
                await sock.sendMessage(from, { text: configCmd.texto }, { quoted: msg });
                return;
            }
        }

        if (isGroup && (comando === '.cerrar' || comando === '.abrir')) {
            try {
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;
                const sender = msg.key.participant || msg.key.remoteJid;

                const senderClean = sender.split(':')[0].split('@')[0];

                const esAdmin = participants.some(p => {
                    const participantClean = p.id.split(':')[0].split('@')[0];
                    return participantClean === senderClean && (p.admin === 'admin' || p.admin === 'superadmin');
                });

                if (!esAdmin) {
                    await sock.sendMessage(from, { text: '❌ Solo administradores pueden usar este comando.' }, { quoted: msg });
                    return;
                }

                if (comando === '.cerrar') {
                    await sock.groupSettingUpdate(from, 'announcement');
                    await sock.sendMessage(from, { text: '🔒 *Grupo cerrado.*' });
                }

                if (comando === '.abrir') {
                    await sock.groupSettingUpdate(from, 'not_announcement');
                    await sock.sendMessage(from, { text: '🔓 *Grupo abierto.*' });
                }

            } catch (err) {
                console.error('Error comando admin:', err);
            }
        }
    });
}

iniciarBot();
