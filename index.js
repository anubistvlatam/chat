const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');

// ==================== MANEJO DE ARCHIVOS Y DIRECTORIOS ====================
const SESSION_DIR = path.join(__dirname, 'sesion_whatsapp');
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

const ARCHIVO_COMANDOS = path.join(__dirname, 'comandos_custom.json');

if (!fs.existsSync(ARCHIVO_COMANDOS)) {
    const comandosIniciales = {
        ".stock": `╭────────────────────────────╮\n💙 ✦ AnubisTV ✦ 💙\n✨ 𝗦𝗧𝗢𝗢𝗖𝗞 𝗗𝗜𝗦𝗣𝗢𝗡𝗜𝗕𝗟𝗘 ✨\n╰────────────────────────────╯\n✨ Cuentas disponibles\n⚡ Entrega rápida\n🤝 Atención personalizada\n⚠️ Consulta disponibilidad antes de realizar tu pago.\n🚫 No se realizan reembolsos.\n\n⋆⋅☆⋅⋆ ✧･ﾟ: 🎬 𝗦𝗧𝗥𝗘𝗔𝗠𝗜𝗡𝗚 :･ﾟ✧ ⋆⋅☆⋅⋆\n❤️ NETFLIX\n▸ 👤 Perfil $55\n▸ 👥 Completa $230\n💙 PRIME VIDEO\n▸ 👤 Perfil $20\n▸ 👥 Completa $45\n🩵 PARAMOUNT+\n▸ 👤 Perfil $17\n▸ 👥 Completa $45\n💙 DISNEY+\n▸ 👤 Perfil $22\n▸ 👥 Completa $70\n💜 MAX PLATINO\n▸ 👤 Perfil $21\n▸ 👥 Completa $55\n🧡 CRUNCHYROLL\n▸ 👤 Perfil $15\n▸ 👥 Completa $45\n🧡 VIX (Mensual)\n▸ 👤 Perfil $11\n▸ 👥 Completa $20\n🧡 VIX (Anual)\n▸ 👤 Perfil $15\n▸ 👥 Completa $30\n\n⋆⋅☆⋅⋆ ✧･ﾟ: 🎵 𝗠𝗨́𝗦𝗜𝗖𝗔 :･ﾟ✧ ⋆⋅☆⋅⋆\n💚 SPOTIFY PREMIUM\n▸ 1 Mes $40\n▸ 3 Meses $85\n❤️ YOUTUBE PREMIUM\n▸ Invitación $25\n▸ Familiar (tus datos) $45\n\n⋆⋅☆⋅⋆ ✧･ﾟ: 🛠️ 𝗔𝗣𝗣𝗦 & 𝗛𝗘𝗥𝗥𝗔𝗠𝗜𝗘𝗡𝗧𝗔𝗦 :･ﾟ✧ ⋆⋅☆⋅⋆\n💜 CANVA PRO\n▸ 1 Mes $25\n▸ 3 Meses $50\n▸ 6 Meses $70\n▸ Anual $90\n💼 MICROSOFT 365\n▸ 1 Mes $25\n▸ 2 Meses $50\n▸ 6 Meses $90\n📦 OTROS SERVICIOS\n🦉 Duolingo $25\n🎧 Deezer $30\n🔞 Pornhub $30`,
        ".combo": `🎁 COMBOS\n💥 Ahorra más comprando en combo\n⚡ Entrega rápida\n✅ Stock disponible\n\n🥇 COMBO #1 | Más vendido\n❤️ Netflix\n💜 Max\n🧡 ViX\n💰 Precio: $80\n\n🥈 COMBO #2\n💙 Disney+\n💙 Prime Video\n🧡 Crunchyroll\n💰 Precio: $55\n\n🥉 COMBO #3\n❤️ Netflix\n💙 Disney+\n💙 Prime Video\n💰 Precio: $84\n\n🎬 COMBO #4\n💜 Max\n🩵 Paramount+\n🧡 ViX\n💰 Precio: $45\n\n🍿 COMBO #5\n💙 Disney+\n🩵 Paramount+\n🧡 ViX\n💰 Precio: $45\n\n🔥 COMBO #6\n❤️ Netflix\n💜 Max\n🧡 Crunchyroll\n💰 Precio: $80\n\n🎵 COMBO #7\n💚 Spotify Premium\n❤️ YouTube Premium\n💰 Precio: $70\n\n📺 COMBO #8\n💙 Prime Video\n🩵 Paramount+\n🧡 ViX\n💰 Precio: $43\n\n⭐ COMBO #9\n💙 Disney+\n💜 Max\n🧡 Crunchyroll\n💰 Precio: $55\n\n👑 COMBO #10 | Premium\n❤️ Netflix\n💙 Disney+\n💜 Max\n💙 Prime Video\n💰 Precio: $85\n\n🩵 💫 ANUBISTV 💫🩵 ┊\n🎵 Tidal $30\n👨‍👩‍👧‍👦 Tidal Familiar $45\n🎬 Mubi $30\n👨‍👩‍👧‍👦 Mubi Familiar $40\n🎥 Universal+ $25\n📺 Fox One $25\n🍎 Apple TV $30\n🍎 Apple TV (3 Meses) $50\n\n⋆⋅☆⋅⋆ ✧･ﾟ: 💙 AnubisTV 💙 :･ﾟ✧ ⋆⋅☆⋅⋆\n✨ Calidad • Confianza • Rapidez\n💬 ¡Gracias por tu preferencia!\n\n┊💫 Streaming AnubisTV 💫 ┊`
    };
    fs.writeFileSync(ARCHIVO_COMANDOS, JSON.stringify(comandosIniciales, null, 2));
}

function cargarComandos() {
    try {
        return JSON.parse(fs.readFileSync(ARCHIVO_COMANDOS, 'utf-8'));
    } catch (e) {
        return {};
    }
}

function guardarComandosBD(comandos) {
    fs.writeFileSync(ARCHIVO_COMANDOS, JSON.stringify(comandos, null, 2));
}

// ==================== SERVIDOR WEB & CLIENTE QR ====================
const app = express();
const PORT = process.env.PORT || 3000;
let rawQR = '';
let botConectado = false;

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
                input, textarea { width: 100%; padding: 12px; margin: 8px 0; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: white; box-sizing: border-box; font-family: inherit; }
                textarea { height: 120px; resize: vertical; }
                button { background: #0284c7; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; margin-top: 10px; }
                button:hover { background: #0369a1; }
                .btn-danger { background: #ef4444; width: auto; padding: 6px 12px; margin: 0; }
                .btn-danger:hover { background: #dc2626; }
                .item-cmd { background: #334155; padding: 15px; border-radius: 8px; margin-bottom: 10px; text-align: left; display: flex; justify-content: space-between; align-items: center; white-space: pre-wrap; }
                .cmd-name { font-weight: bold; color: #4ade80; font-size: 1.1em; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card" id="status-card">
                    <h1>💙 AnubisTV Bot 💙</h1>
                    <p id="status-text">Cargando estado...</p>
                    <div id="qrcode-box"></div>
                </div>

                <div id="panel-admin" style="display: none;">
                    <div class="card" style="text-align: left;">
                        <h2>➕ Crear o Modificar Comando</h2>
                        <label>Comando (ej: .stock, .combo, .peliculas):</label>
                        <input type="text" id="cmd-key" placeholder=".ejemplo" />
                        
                        <label>Respuesta del Bot:</label>
                        <textarea id="cmd-value" placeholder="Escribe aquí la respuesta del bot..."></textarea>
                        
                        <button onclick="guardarComando()">💾 Guardar Comando</button>
                    </div>

                    <div class="card">
                        <h2>📜 Comandos Activos</h2>
                        <div id="lista-comandos">Cargando comandos...</div>
                    </div>
                </div>
            </div>

            <script>
                let qrcodeObj = null;
                let lastQRValue = '';

                async function checkStatus() {
                    try {
                        const response = await fetch('/api/estado');
                        const data = await response.json();
                        const statusText = document.getElementById('status-text');
                        const panelAdmin = document.getElementById('panel-admin');
                        const qrBox = document.getElementById('qrcode-box');

                        if (data.connected) {
                            statusText.innerHTML = '<b style="color:#4ade80; font-size: 1.2em;">✅ Bot Conectado y Activo</b>';
                            qrBox.innerHTML = '';
                            panelAdmin.style.display = 'block';
                            lastQRValue = '';
                            cargarComandosUI();
                        } else if (data.qr) {
                            panelAdmin.style.display = 'none';
                            statusText.innerText = 'Escanea este código QR desde WhatsApp:';
                            
                            if (lastQRValue !== data.qr) {
                                lastQRValue = data.qr;
                                qrBox.innerHTML = '';
                                new QRCode(qrBox, {
                                    text: data.qr,
                                    width: 230,
                                    height: 230
                                });
                            }
                        } else {
                            panelAdmin.style.display = 'none';
                            statusText.innerText = '⌛ Conectando con WhatsApp... (Espere unos segundos)';
                            qrBox.innerHTML = '';
                            lastQRValue = '';
                        }
                    } catch (err) {
                        console.error('Error:', err);
                    }
                }

                async function cargarComandosUI() {
                    const res = await fetch('/api/comandos');
                    const comandos = await res.json();
                    const container = document.getElementById('lista-comandos');
                    container.innerHTML = '';

                    for (const [key, value] of Object.entries(comandos)) {
                        const div = document.createElement('div');
                        div.className = 'item-cmd';
                        div.innerHTML = \`
                            <div>
                                <div class="cmd-name">\${key}</div>
                                <div style="font-size: 0.9em; color: #cbd5e1; max-height: 80px; overflow: hidden; text-overflow: ellipsis;">\${value}</div>
                            </div>
                            <button class="btn-danger" onclick="eliminarComando('\${key}')">Eliminar</button>
                        \`;
                        container.appendChild(div);
                    }
                }

                async function guardarComando() {
                    const key = document.getElementById('cmd-key').value.trim();
                    const value = document.getElementById('cmd-value').value;

                    if (!key.startsWith('.')) {
                        alert('El comando debe comenzar con punto (.) Ej: .peliculas');
                        return;
                    }
                    if (!value) {
                        alert('Por favor escribe la respuesta del comando.');
                        return;
                    }

                    await fetch('/api/comandos', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key, value })
                    });

                    document.getElementById('cmd-key').value = '';
                    document.getElementById('cmd-value').value = '';
                    cargarComandosUI();
                    alert('✅ Comando ' + key + ' guardado exitosamente.');
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
    res.json({ connected: botConectado, qr: rawQR });
});

app.get('/api/comandos', (req, res) => {
    res.json(cargarComandos());
});

app.post('/api/comandos', (req, res) => {
    const { key, value } = req.body;
    const comandos = cargarComandos();
    comandos[key.toLowerCase()] = value;
    guardarComandosBD(comandos);
    res.json({ success: true });
});

app.delete('/api/comandos', (req, res) => {
    const { key } = req.body;
    const comandos = cargarComandos();
    delete comandos[key.toLowerCase()];
    guardarComandosBD(comandos);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🌐 Servidor Web activo en el puerto ${PORT}`));

// ==================== LÓGICA DEL BOT ====================
async function iniciarBot() {
    console.log('🔄 Inicializando sesión Baileys...');
    
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: ['AnubisTV-Server', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('⚡ ¡QR Recibido desde Baileys!');
            botConectado = false;
            rawQR = qr;
        }

        if (connection === 'close') {
            botConectado = false;
            rawQR = '';
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const causaCierreSesion = statusCode === DisconnectReason.loggedOut;

            if (causaCierreSesion) {
                console.log('⚠️ Sesión terminada. Limpiando datos...');
                if (fs.existsSync(SESSION_DIR)) {
                    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
                }
            }
            console.log('📡 Reconectando...');
            setTimeout(iniciarBot, 3000);
        } else if (connection === 'open') {
            botConectado = true;
            rawQR = '';
            console.log('✅ Bot de AnubisTV conectado con éxito a WhatsApp');
        }
    });

    // Bienvenida a nuevos miembros
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

    // Lectura de comandos
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
            await sock.sendMessage(from, { text: comandosDB[comando] }, { quoted: msg });
            return;
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
                    await sock.sendMessage(from, { text: '❌ *Acceso denegado:* Solo administradores pueden usar este comando.' }, { quoted: msg });
                    return;
                }

                if (comando === '.cerrar') {
                    await sock.groupSettingUpdate(from, 'announcement');
                    await sock.sendMessage(from, { text: '🔒 *Grupo cerrado.* Solo administradores pueden enviar mensajes.' });
                }

                if (comando === '.abrir') {
                    await sock.groupSettingUpdate(from, 'not_announcement');
                    await sock.sendMessage(from, { text: '🔓 *Grupo abierto.* Todos los miembros pueden enviar mensajes.' });
                }

            } catch (err) {
                console.error('Error comando admin:', err);
            }
        }
    });
}

// Iniciar ejecuciones
iniciarBot();
