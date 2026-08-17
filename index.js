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

// CACHÉ EN MEMORIA RAM
let COMANDOS_CACHE = {};

function inicializarComandos() {
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
    cargarComandosRAM();
}

function cargarComandosRAM() {
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
        COMANDOS_CACHE = estandarizado;
    } catch (e) {
        COMANDOS_CACHE = {};
    }
}

function guardarComandosBD(comandos) {
    COMANDOS_CACHE = comandos;
    fs.writeFileSync(ARCHIVO_COMANDOS, JSON.stringify(comandos, null, 2));
}

inicializarComandos();

// Función de extracción limpia de número (Soporta LID, JID y México 521/52)
function extraerNumeroPuro(jidOrObj) {
    if (!jidOrObj) return '';
    const str = typeof jidOrObj === 'string' ? jidOrObj : (jidOrObj.id || jidOrObj.jid || '');
    let num = str.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    
    // Normalización de números mexicanos (521XXXX -> 52XXXX)
    if (num.startsWith('521') && num.length === 13) {
        num = '52' + num.substring(3);
    }
    return num;
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
                .btn-danger { background: #ef4444; width: auto; padding: 6px 12px; margin: 0; }
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
                </div>

                <div id="panel-admin" style="display: none;">
                    <div class="card" style="text-align: left;">
                        <h2>➕ Crear o Modificar Comando</h2>
                        <label>Comando (Ej: .stock, .combo, .peliculas):</label>
                        <input type="text" id="cmd-key" placeholder=".peliculas" />
                        
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

    // ==================== DETECCION DE RANGO ADMIN Y BIENVENIDA CON CANCIÓN ====================
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        const numBot = extraerNumeroPuro(sock.user);

        if (action === 'promote') {
            const botFuePromovido = participants.some(p => {
                const numP = extraerNumeroPuro(p);
                return numP && numBot && (numP === numBot || numP.includes(numBot) || numBot.includes(numP));
            });

            if (botFuePromovido) {
                console.log(`🎉 Bot ascendido a Admin en el grupo: ${id}`);
                await sock.sendMessage(id, {
                    text: `🤖 *BOT AnubiSystem ACTIVADO*\n\n¡Gracias por otorgarme el rango de Administrador!\nA partir de ahora estoy 100% activo para responder en este grupo. 🍿💙`
                });
                return;
            }
        }

        // BIENVENIDA (Imagen + Canción Marilyn Manson - This Is the New Shit)
        if (action === 'add') {
            try {
                for (const usuario of participants) {
                    const usuarioJid = typeof usuario === 'string' ? usuario : (usuario.id || '');
                    const usuarioTag = `@${usuarioJid.split('@')[0]}`;
                    const mensajeBienvenida = `¡Hola ${usuarioTag}! 👋\n\n` +
                    `✨ *Bienvenido a AnubisTV* ✨\n\n` +
                    `📜 *Reglas del grupo:*\n` +
                    `1️⃣ No insultar y respetar a cada miembro del grupo.\n` +
                    `2️⃣ Si tienen fallas con la cuenta, mandar msj en privado.\n\n` +
                    `Escribe *.stock* o *.combo* para ver nuestro catálogo. 🍿💙`;

                    let ppUrl;
                    try {
                        ppUrl = await sock.profilePictureUrl(usuarioJid, 'image');
                    } catch (e) {
                        ppUrl = 'https://i.imgur.com/39a3N9e.png';
                    }

                    const response = await axios.get(ppUrl, { responseType: 'arraybuffer' });
                    const imageBuffer = Buffer.from(response.data, 'binary');

                    // 1. Enviar foto con mensaje de bienvenida
                    await sock.sendMessage(id, {
                        image: imageBuffer,
                        caption: mensajeBienvenida,
                        mentions: [usuarioJid]
                    });

                    // 2. Descargar y enviar canción "Marilyn Manson - This Is the New Shit"
                    try {
                        const apiRes = await axios.get(`https://api.vreden.web.id/api/download/playaudio?query=${encodeURIComponent('Marilyn Manson This Is the New Shit')}`);
                        const audioUrl = apiRes.data?.result?.downloadUrl || apiRes.data?.result?.url;

                        if (audioUrl) {
                            await sock.sendMessage(id, { 
                                audio: { url: audioUrl }, 
                                mimetype: 'audio/mp4',
                                ptt: false 
                            });
                        }
                    } catch (audioErr) {
                        console.error('Error al enviar audio de bienvenida:', audioErr.message);
                    }
                }
            } catch (err) {
                console.error('Error bienvenida:', err);
            }
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

        // Validamos que sea un comando con punto (.)
        if (!primerComando.startsWith('.')) return;

        console.log(`📩 Comando detectado: "${primerComando}" en ${from}`);

        if (isGroup) {
            try {
                const groupMetadata = await sock.groupMetadata(from);
                const numBot = extraerNumeroPuro(sock.user);
                
                // Comprobación flexible multi-ID
                let botEsAdmin = false;
                if (groupMetadata && groupMetadata.participants) {
                    botEsAdmin = groupMetadata.participants.some(p => {
                        const esAdminRole = (p.admin === 'admin' || p.admin === 'superadmin');
                        if (!esAdminRole) return false;

                        const numP = extraerNumeroPuro(p);
                        if (numP && numBot && (numP === numBot || numP.includes(numBot) || numBot.includes(numP))) {
                            return true;
                        }
                        return false;
                    });
                }

                // Si por alguna razón la metadata no confirma admin pero enviaron un comando, lo permitimos procesar
                if (!botEsAdmin) {
                    console.log(`ℹ️ Evaluando comando en grupo ${from}. Procesando directo.`);
                }
            } catch (e) {
                console.error('⚠️ Error al obtener metadatos del grupo:', e.message);
            }
        }

        // 1. COMANDO .CURP
        if (primerComando === '.curp') {
            const curpIngresada = partes[1]?.toUpperCase().trim();
            if (!curpIngresada || curpIngresada.length !== 18) {
                return await sock.sendMessage(from, { text: '⚠️ Escribe tu CURP válida de 18 caracteres.\nEjemplo: `.curp ABCD123456HDFRRR01`' }, { quoted: msg });
            }

            await sock.sendMessage(from, { text: '🔎 Consultando y generando solicitud de CURP...' }, { quoted: msg });

            try {
                const apiCurp = await axios.get(`https://curp-api.vercel.app/api/curp/${curpIngresada}`);
                
                if (apiCurp.data && apiCurp.data.curp) {
                    const datos = apiCurp.data;
                    const respuestaCurp = `📄 *SOLICITUD DE CURP REGISTRADA*\n\n` +
                    `👤 *Nombre:* ${datos.nombres || ''} ${datos.apellidoPaterno || ''} ${datos.apellidoMaterno || ''}\n` +
                    `🆔 *CURP:* ${datos.curp}\n` +
                    `📅 *Fecha de Nac:* ${datos.fechaNacimiento || 'N/D'}\n` +
                    `👫 *Sexo:* ${datos.sexo === 'H' ? 'Hombre' : 'Mujer'}\n` +
                    `📍 *Estado:* ${datos.estadoNacimiento || 'N/D'}\n\n` +
                    `📩 *Tu archivo en PDF oficial se está procesando. Un asesor te lo adjuntará en breve.*`;

                    await sock.sendMessage(from, { text: respuestaCurp }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: '❌ No se encontraron datos con esa CURP. Verifica los caracteres.' }, { quoted: msg });
                }
            } catch (err) {
                await sock.sendMessage(from, { text: '❌ Error al consultar. Un asesor revisará tu solicitud manualmente.' }, { quoted: msg });
            }
            return;
        }

        // 2. COMANDO .RFC
        if (primerComando === '.rfc') {
            const datosIngresados = textoLimpio.substring(primerComando.length).trim();
            if (!datosIngresados) {
                return await sock.sendMessage(from, { text: '⚠️ Escribe tu RFC o Nombre completo.\nEjemplo: `.rfc ABCD900101XXX`' }, { quoted: msg });
            }

            const respuestaRfc = `📄 *SOLICITUD DE CONSTANCIA RFC*\n\n` +
            `📝 *Dato ingresado:* ${datosIngresados}\n` +
            `STATUS: En cola de expedición SAT.\n\n` +
            `📩 *Un asesor procesará tu archivo en PDF oficial y lo enviará a este chat.*`;

            return await sock.sendMessage(from, { text: respuestaRfc }, { quoted: msg });
        }

        // 3. COMANDO .ACTAMATRIMONIO
        if (primerComando === '.actamatrimonio') {
            const datosIngresados = textoLimpio.substring(primerComando.length).trim();
            if (!datosIngresados) {
                return await sock.sendMessage(from, { text: '⚠️ Escribe los nombres de los cónyuges y estado.\nEjemplo: `.actamatrimonio Juan Pérez y Maria Gómez - CDMX`' }, { quoted: msg });
            }

            const respuestaMatrimonio = `💍 *SOLICITUD DE ACTA DE MATRIMONIO*\n\n` +
            `📝 *Datos del Registro:* ${datosIngresados}\n` +
            `STATUS: Registrado en sistema SIDEA.\n\n` +
            `📩 *Procesando expedición en PDF oficial digitalizado.*`;

            return await sock.sendMessage(from, { text: respuestaMatrimonio }, { quoted: msg });
        }

        // 4. COMANDO .DEFUNCION
        if (primerComando === '.defuncion' || primerComando === '.actadefuncion') {
            const datosIngresados = textoLimpio.substring(primerComando.length).trim();
            if (!datosIngresados) {
                return await sock.sendMessage(from, { text: '⚠️ Escribe el nombre completo del finado y estado.\nEjemplo: `.defuncion Pedro López García - Estado de México`' }, { quoted: msg });
            }

            const respuestaDefuncion = `⚰️ *SOLICITUD DE ACTA DE DEFUNCIÓN*\n\n` +
            `📝 *Finado registrado:* ${datosIngresados}\n` +
            `STATUS: Búsqueda en Registro Civil Activa.\n\n` +
            `📩 *Un asesor validará los folios y te compartirá el PDF oficial.*`;

            return await sock.sendMessage(from, { text: respuestaDefuncion }, { quoted: msg });
        }

        // 5. ACTUALIZACIÓN DE STOCK Y COMBOS POR CHAT
        if (primerComando === '.actualizastock') {
            const contenido = textoLimpio.substring(primerComando.length).trim();
            if (!contenido) return await sock.sendMessage(from, { text: '⚠️ Usa: `.actualizastock Nuevo texto de stock`' }, { quoted: msg });
            
            const comandos = { ...COMANDOS_CACHE };
            comandos['.stock'] = { texto: contenido, imagen: comandos['.stock']?.imagen || "" };
            guardarComandosBD(comandos);
            return await sock.sendMessage(from, { text: '✅ Stock actualizado con éxito.' }, { quoted: msg });
        }

        if (primerComando === '.actualizacombo' || primerComando === '.actualizacombos') {
            const contenido = textoLimpio.substring(primerComando.length).trim();
            if (!contenido) return await sock.sendMessage(from, { text: '⚠️ Usa: `.actualizacombo Nuevo texto de combos`' }, { quoted: msg });
            
            const comandos = { ...COMANDOS_CACHE };
            comandos['.combo'] = { texto: contenido, imagen: comandos['.combo']?.imagen || "" };
            comandos['.combos'] = { texto: contenido, imagen: comandos['.combo']?.imagen || "" };
            guardarComandosBD(comandos);
            return await sock.sendMessage(from, { text: '✅ Combos actualizados con éxito.' }, { quoted: msg });
        }

        if (primerComando === '.agregardinamico') {
            const nuevoCmd = partes[1]?.toLowerCase();
            const contenido = textoLimpio.substring(partes[0].length + (partes[1]?.length || 0) + 1).trim();

            if (!nuevoCmd || !nuevoCmd.startsWith('.') || !contenido) {
                return await sock.sendMessage(from, { text: '⚠️ Usa: `.agregardinamico .agregapeliculas Texto o catálogo aquí`' }, { quoted: msg });
            }

            const comandos = { ...COMANDOS_CACHE };
            comandos[nuevoCmd] = { texto: contenido, imagen: "" };
            guardarComandosBD(comandos);
            return await sock.sendMessage(from, { text: `✅ Comando ${nuevoCmd} creado e integrado.` }, { quoted: msg });
        }

        // 6. DESCARGA DE VÍDEOS Y MÚSICA
        if (primerComando === '.descargar') {
            const url = partes[1];
            if (!url) return await sock.sendMessage(from, { text: '⚠️ Coloca el enlace. Ej: `.descargar https://link-del-video`' }, { quoted: msg });

            await sock.sendMessage(from, { text: '⏳ Procesando descarga, por favor espera...' }, { quoted: msg });
            try {
                const apiRes = await axios.get(`https://api.vreden.web.id/api/download/video?url=${encodeURIComponent(url)}`);
                const downloadUrl = apiRes.data?.result?.downloadUrl || apiRes.data?.result?.url;

                if (downloadUrl) {
                    await sock.sendMessage(from, { 
                        video: { url: downloadUrl }, 
                        caption: '🎬 ¡Aquí tienes tu vídeo/película descargado!' 
                    }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: '❌ No se pudo extraer el vídeo de ese enlace.' }, { quoted: msg });
                }
            } catch (err) {
                await sock.sendMessage(from, { text: '❌ Error al procesar el enlace de descarga.' }, { quoted: msg });
            }
            return;
        }

        if (primerComando === '.musica') {
            const busqueda = textoLimpio.substring(primerComando.length).trim();
            if (!busqueda) return await sock.sendMessage(from, { text: '⚠️ Escribe la canción. Ej: `.musica Bad Bunny`' }, { quoted: msg });

            await sock.sendMessage(from, { text: '🎵 Buscando y descargando audio...' }, { quoted: msg });
            try {
                const apiRes = await axios.get(`https://api.vreden.web.id/api/download/playaudio?query=${encodeURIComponent(busqueda)}`);
                const audioUrl = apiRes.data?.result?.downloadUrl || apiRes.data?.result?.url;

                if (audioUrl) {
                    await sock.sendMessage(from, { 
                        audio: { url: audioUrl }, 
                        mimetype: 'audio/mp4',
                        ptt: false 
                    }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: '❌ No se encontró la canción.' }, { quoted: msg });
                }
            } catch (err) {
                await sock.sendMessage(from, { text: '❌ Error al buscar la música.' }, { quoted: msg });
            }
            return;
        }

        // 7. RESPUESTA RÁPIDA DE COMANDOS GUARDADOS
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

                    await sock.sendMessage(from, {
                        image: imageBuffer,
                        caption: configCmd.texto || ''
                    }, { quoted: msg });
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

        // 8. COMANDOS DE ADMINISTRACIÓN DE GRUPO
        if (isGroup && (comando === '.cerrar' || comando === '.abrir')) {
            try {
                const groupMetadata = await sock.groupMetadata(from);
                const sender = msg.key.participant || msg.key.remoteJid;
                const numSender = extraerNumeroPuro(sender);

                const esAdmin = groupMetadata.participants.some(p => {
                    const numP = extraerNumeroPuro(p);
                    return numP === numSender && (p.admin === 'admin' || p.admin === 'superadmin');
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
