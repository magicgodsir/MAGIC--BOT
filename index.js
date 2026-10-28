const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    delay
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;
let botPrefix = '.';
let settingsState = {
    autostatusview: 'off',
    autoreact: 'off',
    autodl: 'off',
    alwaysonline: 'off'
};

// ==================== STYLISH PAIR HTML ROUTE ====================
app.get('/pair', async (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Music Bot - Pairing Portal</title>
        <style>
            @keyframes borderGlow {
                0% { border-color: #ff0055; box-shadow: 0 0 15px #ff0055, inset 0 0 15px #ff0055; }
                50% { border-color: #0055ff; box-shadow: 0 0 25px #0055ff, inset 0 0 25px #0055ff; }
                100% { border-color: #ff0055; box-shadow: 0 0 15px #ff0055, inset 0 0 15px #ff0055; }
            }
            body {
                background-color: #0b0b0b;
                color: #ffffff;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
            }
            .card {
                background: #121212;
                padding: 30px;
                border-radius: 16px;
                border: 3px solid #ff0055;
                animation: borderGlow 4s infinite alternate;
                text-align: center;
                width: 350px;
            }
            h2 {
                margin-bottom: 10px;
                color: #00ffff;
                text-shadow: 0 0 10px rgba(0,255,255,0.5);
            }
            p {
                color: #a0a0a0;
                font-size: 14px;
                margin-bottom: 20px;
            }
            .number-display {
                font-size: 24px;
                font-weight: bold;
                letter-spacing: 2px;
                color: #00ff66;
                background: #1a1a1a;
                padding: 12px;
                border-radius: 8px;
                border: 1px dashed #0055ff;
                margin-bottom: 20px;
            }
            .btn {
                background: linear-gradient(45deg, #ff0055, #0055ff);
                border: none;
                color: white;
                padding: 10px 20px;
                font-size: 16px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: bold;
                transition: 0.3s;
            }
            .btn:hover {
                opacity: 0.9;
                transform: scale(1.05);
            }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>Music Bot Pairing</h2>
            <p>Use the official pairing number below to connect your WhatsApp account:</p>
            <div class="number-display">70502 60136</div>
            <button class="btn" onclick="alert('Pairing interface active. Connect via WhatsApp linked devices.')">Connected Ready</button>
        </div>
    </body>
    </html>
    `);
});

app.get('/', (req, res) => {
    res.send('Music Bot is running successfully! Go to /pair for pairing interface.');
});

// ==================== WHATSAPP BOT CONNECTION ====================
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    
    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        browser: Browsers.macOS('Chrome'),
        auth: state
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('✅ Bot successfully logged in & started!');
        } else if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startBot();
            }
        }
    });

    // ==================== COMMAND HANDLER ====================
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const mek = messages[0];
        if (!mek.message || mek.key.fromMe) return;

        const messageType = Object.keys(mek.message)[0];
        const body = messageType === 'conversation' ? mek.message.conversation :
                     messageType === 'extendedTextMessage' ? mek.message.extendedTextMessage.text : '';

        if (!body.startsWith(botPrefix)) return;

        const args = body.slice(botPrefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        const sender = mek.key.remoteJid;

        switch (command) {
            case 'menu':
                let menuText = `🎶 *MUSIC BOT MENU* 🎶\n\n` +
                               `Prefix: ${botPrefix}\n\n` +
                               `1. ${botPrefix}menu\n` +
                               `2. ${botPrefix}ping\n` +
                               `3. ${botPrefix}alive\n` +
                               `4. ${botPrefix}setprefix <symbol>\n` +
                               `5. ${botPrefix}settings\n` +
                               `6. ${botPrefix}autostatusview <on/off>\n` +
                               `7. ${botPrefix}autoreact <on/off>\n` +
                               `8. ${botPrefix}autodl <on/off>\n` +
                               `9. ${botPrefix}alwaysonline <on/off>\n` +
                               `10. ${botPrefix}settings commands\n`;
                await sock.sendMessage(sender, { text: menuText }, { quoted: mek });
                break;

            case 'ping':
                await sock.sendMessage(sender, { text: 'Pong! 🏓 Bot is active and fast.' }, { quoted: mek });
                break;

            case 'alive':
                await sock.sendMessage(sender, { text: '✨ Bot is alive and running smoothly!' }, { quoted: mek });
                break;

            case 'setprefix':
                if (!args[0]) {
                    await sock.sendMessage(sender, { text: `Please provide a prefix. Current prefix is: ${botPrefix}` }, { quoted: mek });
                    return;
                }
                botPrefix = args[0];
                await sock.sendMessage(sender, { text: `Prefix successfully changed to: ${botPrefix}` }, { quoted: mek });
                break;

            case 'settings':
            case 'settings_commands':
                let settingsText = `⚙️ *BOT SETTINGS STATUS* ⚙️\n\n` +
                                   `- Autostatusview: ${settingsState.autostatusview}\n` +
                                   `- Autoreact: ${settingsState.autoreact}\n` +
                                   `- Autodl: ${settingsState.autodl}\n` +
                                   `- Alwaysonline: ${settingsState.alwaysonline}\n`;
                await sock.sendMessage(sender, { text: settingsText }, { quoted: mek });
                break;

            case 'autostatusview':
                if (args[0] === 'on' || args[0] === 'off') {
                    settingsState.autostatusview = args[0];
                    await sock.sendMessage(sender, { text: `Autostatusview turned ${args[0]}` }, { quoted: mek });
                } else {
                    await sock.sendMessage(sender, { text: `Use: ${botPrefix}autostatusview on / off` }, { quoted: mek });
                }
                break;

            case 'autoreact':
                if (args[0] === 'on' || args[0] === 'off') {
                    settingsState.autoreact = args[0];
                    await sock.sendMessage(sender, { text: `Autoreact turned ${args[0]}` }, { quoted: mek });
                } else {
                    await sock.sendMessage(sender, { text: `Use: ${botPrefix}autoreact on / off` }, { quoted: mek });
                }
                break;

            case 'autodl':
                if (args[0] === 'on' || args[0] === 'off') {
                    settingsState.autodl = args[0];
                    await sock.sendMessage(sender, { text: `Autodl turned ${args[0]}` }, { quoted: mek });
                } else {
                    await sock.sendMessage(sender, { text: `Use: ${botPrefix}autodl on / off` }, { quoted: mek });
                }
                break;

            case 'alwaysonline':
                if (args[0] === 'on' || args[0] === 'off') {
                    settingsState.alwaysonline = args[0];
                    await sock.sendMessage(sender, { text: `Alwaysonline turned ${args[0]}` }, { quoted: mek });
                } else {
                    await sock.sendMessage(sender, { text: `Use: ${botPrefix}alwaysonline on / off` }, { quoted: mek });
                }
                break;

            default:
                break;
        }
    });
}

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startBot();
});
