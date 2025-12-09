// index.js — Bot Discord Corrigido
require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const axios = require('axios');
const express = require('express');

const TOKEN = process.env.DISCORD_TOKEN;
const TARGET_URL = process.env.TARGET_URL;
const AUTH_HEADER = process.env.AUTH_HEADER || '';

if (!TOKEN || !TARGET_URL) {
    console.error('Faltando DISCORD_TOKEN ou TARGET_URL no .env');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

// --- Estado ---
const pendingScans = new Map();
const SCAN_DEBOUNCE_MS = 1200;
const lastSentForChannel = new Map();
let currentUsers = [];

// --- Helpers ---
function buildHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (AUTH_HEADER) headers['Authorization'] = AUTH_HEADER;
    return headers;
}

function usersEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].userId !== b[i].userId) return false;
    }
    return true;
}

// --- Lógica Voice ---
async function handleChannelMembers(channel, membersCollection) {
    try {
        const humans = membersCollection.filter(m => !m.user.bot);
        const users = humans.map(m => ({
            userId: m.id || m.user.id,
            name: m.displayName || m.user.username,
            avatarUrl: m.user.displayAvatarURL({ dynamic: true, size: 512, format: 'png' })
        }));

        if (users.length > 0) currentUsers = users;

        const payload = {
            guildId: channel.guild.id,
            guildName: channel.guild.name,
            channelId: channel.id,
            channelName: channel.name,
            users
        };

        const last = lastSentForChannel.get(channel.id);
        if (last && usersEqual(last, users)) return;

        lastSentForChannel.set(channel.id, users);
    } catch (err) {
        console.error('Erro handleChannelMembers:', err);
    }
}

async function scanAndSendAllVoiceChannels() {
    try {
        for (const [, guild] of client.guilds.cache) {
            try { await guild.members.fetch(); } catch (e) { }
            const voiceChannels = guild.channels.cache.filter(c =>
                c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice
            );
            for (const [, channel] of voiceChannels) {
                const members = channel.members.filter(m => !m.user.bot);
                if (members.size > 0) await handleChannelMembers(channel, members);
            }
        }
    } catch (err) {
        console.error('Erro scan:', err);
    }
}

// --- Discord Events ---
client.once('ready', async () => {
    console.log(`Logado como ${client.user.tag}`);
    await scanAndSendAllVoiceChannels();
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const channel = newState.channel || oldState.channel;
    if (!channel) return;

    if (pendingScans.has(channel.id)) clearTimeout(pendingScans.get(channel.id));

    pendingScans.set(channel.id, setTimeout(async () => {
        pendingScans.delete(channel.id);
        try { await channel.guild.members.fetch(); } catch (e) { }
        const members = channel.members.filter(m => !m.user.bot);
        await handleChannelMembers(channel, members);
    }, SCAN_DEBOUNCE_MS));
});

// --- API Express ---
const app = express();

// CORS - Permitir requisições do frontend na Vercel
app.use((req, res, next) => {
    const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:5173', // Vite dev  
        'https://SEU_FRONTEND_VERCEL.vercel.app' // Substitua pela URL do Vercel
    ];

    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    next();
});

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/api/users', (req, res) => res.json(currentUsers));

app.post('/move-users', async (req, res) => {
    const { guildId, assignments } = req.body;
    if (!guildId || !assignments) return res.status(400).json({ ok: false });

    try {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
        const results = [];

        for (const a of assignments) {
            try {
                const member = await guild.members.fetch(a.userId);
                if (member.voice.channel) {
                    await member.voice.setChannel(a.channelId);
                    results.push({ userId: a.userId, ok: true });
                } else {
                    results.push({ userId: a.userId, ok: false, reason: 'Not in voice' });
                }
            } catch (e) {
                results.push({ userId: a.userId, ok: false, reason: e.message });
            }
            await new Promise(r => setTimeout(r, 200));
        }
        res.json({ ok: true, results });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// --- ROTA DE NOTIFICAÇÃO (CORRIGIDA) ---
app.post('/notify-leaders', async (req, res) => {
    const { leaders, link } = req.body;

    if (!leaders || !Array.isArray(leaders)) {
        return res.status(400).json({ ok: false, error: 'Array "leaders" obrigatório.' });
    }

    const appLink = link || 'Link indisponível';
    const results = [];

    for (const leader of leaders) {
        try {
            const user = await client.users.fetch(leader.userId);
            if (user) {
                // Generate unique link for this captain
                const uniqueLink = `${appLink}?captainId=${leader.userId}`;

                // Mensagem personalizada
                const message = `👑 **Você é Líder!**\n\n` +
                    `Acesse o painel para escolher seu time:\n🔗 ${uniqueLink}\n\n` +
                    `⚠️ **Atenção:** A intenção é que **um líder escolha por vez**.\n` +
                    `Não mexa na aplicação ao mesmo tempo que o outro líder.`;

                await user.send(message);
                console.log(`DM enviada para ${user.tag} com link: ${uniqueLink}`);
                results.push({ userId: leader.userId, ok: true });
            }
        } catch (err) {
            console.error(`Erro DM ${leader.userId}:`, err.message);
            results.push({ userId: leader.userId, ok: false, error: err.message });
        }
    }

    res.json({ ok: true, results });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Bot rodando na porta ${port}`));

client.login(TOKEN);