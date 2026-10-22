const express = require('express');
const { Client, Intents, REST, Routes } = require('discord.js');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const client = new Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MEMBERS,
        Intents.FLAGS.GUILD_PRESENCES,
        Intents.FLAGS.DIRECT_MESSAGES
    ]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const PORT = process.env.PORT || 3000;

let _botReadyResolve;
const botReady = new Promise(resolve => { _botReadyResolve = resolve; });

const ROLE_CATEGORIES = [
    {
        key: 'founder',
        label: 'Founder',
        icon: 'lucide:crown',
        roleIds: ['1485349074235428884']
    },
    {
        key: 'owner',
        label: 'Owner',
        icon: 'lucide:star',
        roleIds: ['1485349075053445130']
    },
    {
        key: 'administrator',
        label: 'Administrator',
        icon: 'lucide:shield',
        roleIds: ['1485349093625823374']
    },
    {
        key: 'head',
        label: 'Head',
        icon: 'lucide:users',
        roleIds: [
            '1485349100261216266',
            '1485349101259456593',
            '1485349102438056089'
        ],
        subRoles: {
            '1485349100261216266': 'Head of Moderation',
            '1485349101259456593': 'Head of Exchanger',
            '1485349102438056089': 'Head of Applications'
        }
    },
    {
        key: 'moderator',
        label: 'Moderator',
        icon: 'lucide:shield-check',
        roleIds: [
            '1485349107399655455',
            '1485349106518982706'
        ]
    },
    {
        key: 'exchanger',
        label: 'Exchanger',
        icon: 'lucide:arrow-left-right',
        roleIds: ['1485349108502761652']
    }
];

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'x7_bot',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 30000
};

console.log('Database Config:', {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    database: dbConfig.database
});

const pool = mysql.createPool(dbConfig);

pool.getConnection()
    .then(connection => {
        console.log('Database connection pool created successfully');
        connection.release();
    })
    .catch(error => {
        console.error('Database connection failed:', error.code, error.message);
        if (error.code === 'ETIMEDOUT') {
            console.error('    ETIMEDOUT - Connection timed out (host unreachable)');
        } else if (error.code === 'ECONNREFUSED') {
            console.error('    ECONNREFUSED - Connection refused');
        } else if (error.code === 'ER_ACCESS_DENIED_USER') {
            console.error('    ACCESS DENIED - Wrong credentials');
        }
    });

const connectedClients = new Set();

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

function getMemberCategory(member) {
    const memberRoleIds = member.roles.cache.map(r => r.id);
    for (const cat of ROLE_CATEGORIES) {
        for (const roleId of cat.roleIds) {
            if (memberRoleIds.includes(roleId)) {
                let subLabel = null;
                if (cat.subRoles) {
                    for (const [subRoleId, subRoleName] of Object.entries(cat.subRoles)) {
                        if (memberRoleIds.includes(subRoleId)) {
                            subLabel = subRoleName;
                            break;
                        }
                    }
                }
                return { category: cat.key, subLabel };
            }
        }
    }
    return null;
}

function buildMemberObj(member, categoryInfo) {
    const topRole = member.roles.cache
        .filter(r => r.name !== '@everyone')
        .sort((a, b) => b.position - a.position)
        .first();

    return {
        id: member.user.id,
        username: member.user.username,
        displayName: member.displayName,
        avatar: member.user.displayAvatarURL({ size: 256, dynamic: true }),
        roles: member.roles.cache.map(role => ({
            id: role.id,
            name: role.name,
            color: role.hexColor
        })),
        joinedAt: member.joinedAt,
        status: member.presence?.status || 'offline',
        category: categoryInfo.category,
        subLabel: categoryInfo.subLabel,
        topRoleColor: topRole?.hexColor || null
    };
}

app.get('/api/health', (req, res) => {
    const guild = client.guilds.cache.get(GUILD_ID);
    res.json({
        status: 'ok',
        botReady: client.isReady(),
        guildFound: !!guild,
        guildName: guild?.name || 'Not found',
        guildId: GUILD_ID
    });
});

app.get('/api/stats', async (req, res) => {
    try {
        await botReady;
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
            return res.status(404).json({ error: 'Guild not found' });
        }

        const memberCount = guild.memberCount;

        const onlineCount = guild.presences.cache.filter(
            p => p.status === 'online' || p.status === 'idle' || p.status === 'dnd'
        ).size;

        let vouchCount = 0;
        let connection;
        try {
            connection = await pool.getConnection();
            const [[{ count }]] = await connection.query('SELECT COUNT(*) as count FROM vouches');
            vouchCount = count;
        } catch (_) {
        } finally {
            if (connection) connection.release();
        }

        res.json({ memberCount, onlineCount, vouchCount });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats', message: error.message });
    }
});

app.get('/api/test', (req, res) => {
    console.log('Test endpoint called');
    res.json({ status: 'ok', message: 'Server is responding', timestamp: new Date().toISOString() });
});

app.get('/api/db-test', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.query('SELECT 1 as test');
        res.json({ success: true, message: 'Database connection successful' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Database connection failed', message: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/vouches', async (req, res) => {
    let connection;
    try {
        await botReady;
        console.log('Fetching vouches...');
        connection = await pool.getConnection();

        const [rows] = await connection.query(
            'SELECT id, exchangerId, exchangerUsername, clientId, fromCurrency, toCurrency, amount, currency, createdAt FROM vouches ORDER BY createdAt DESC'
        );

        console.log(`Retrieved ${rows.length} vouches from database`);

        const guild = client.guilds.cache.get(GUILD_ID);

        const vouches = await Promise.all(rows.map(async row => {
            let clientAvatar = null;
            let clientDisplayName = null;

            if (guild && row.clientId) {
                try {
                    const member = await guild.members.fetch({ user: row.clientId, force: true }).catch(() => null);
if (member) {
    clientAvatar = member.user.displayAvatarURL({ size: 128, dynamic: true, format: 'png' });
    clientDisplayName = member.displayName;
} else {
    try {
        const user = await client.users.fetch(row.clientId, { force: true });
        if (user) {
            clientAvatar = user.displayAvatarURL({ size: 128, dynamic: true, format: 'png' });
            clientDisplayName = user.username;
        }
    } catch (_) {}
}
                } catch (_) {}
            }

            let exchangerAvatar = null;
            if (guild && row.exchangerId) {
                try {
                    const member = await guild.members.fetch(row.exchangerId).catch(() => null);
                    if (member) {
                        exchangerAvatar = member.user.displayAvatarURL({ size: 128, dynamic: true });
                    }
                } catch (_) {}
            }

            return {
                id: row.id,
                exchangerId: row.exchangerId,
                exchangerUsername: row.exchangerUsername,
                exchangerAvatar,
                clientId: row.clientId,
                clientDisplayName,
                clientAvatar,
                fromCurrency: row.fromCurrency,
                toCurrency: row.toCurrency,
                amount: parseFloat(row.amount),
                currency: row.currency,
                createdAt: row.createdAt
            };
        }));

        res.json({ success: true, count: vouches.length, vouches });
    } catch (error) {
        console.error('Error fetching vouches:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch vouches', message: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/vouches/:id', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        connection = await pool.getConnection();

        const [rows] = await connection.query(
            'SELECT id, exchangerId, exchangerUsername, clientId, fromCurrency, toCurrency, amount, currency, createdAt FROM vouches WHERE id = ?',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Vouch not found' });
        }

        const row = rows[0];
        res.json({
            success: true,
            vouch: {
                id: row.id,
                exchangerId: row.exchangerId,
                exchangerUsername: row.exchangerUsername,
                clientId: row.clientId,
                fromCurrency: row.fromCurrency,
                toCurrency: row.toCurrency,
                amount: parseFloat(row.amount),
                currency: row.currency,
                createdAt: row.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch vouch', message: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/team', async (req, res) => {
    try {
        await botReady;
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
            console.error('Guild not found:', GUILD_ID);
            return res.status(404).json({ error: 'Guild not found' });
        }

        const members = await guild.members.fetch().catch(err => {
            console.error('Error fetching members:', err.message);
            return null;
        });

        if (!members) {
            return res.status(500).json({ error: 'Failed to fetch members' });
        }

        const categorized = {};
        for (const cat of ROLE_CATEGORIES) {
            categorized[cat.key] = [];
        }

        members
            .filter(member => !member.user.bot)
            .forEach(member => {
                const catInfo = getMemberCategory(member);
                if (catInfo) {
                    categorized[catInfo.category].push(buildMemberObj(member, catInfo));
                }
            });

        for (const key of Object.keys(categorized)) {
            categorized[key].sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
        }

        res.json({
            categories: ROLE_CATEGORIES.map(cat => ({
                key: cat.key,
                label: cat.label,
                icon: cat.icon,
                members: categorized[cat.key] || []
            }))
        });
    } catch (error) {
        console.error('Error fetching team members:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    connectedClients.add(ws);
    ws.on('close', () => {
        console.log('WebSocket client disconnected');
        connectedClients.delete(ws);
    });
});

async function broadcastTeamUpdate() {
    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return;

        const members = await guild.members.fetch();
        const categorized = {};
        for (const cat of ROLE_CATEGORIES) categorized[cat.key] = [];

        members.filter(m => !m.user.bot).forEach(member => {
            const catInfo = getMemberCategory(member);
            if (catInfo) categorized[catInfo.category].push(buildMemberObj(member, catInfo));
        });

        const message = JSON.stringify({
            type: 'team_update',
            categories: ROLE_CATEGORIES.map(cat => ({
                key: cat.key,
                label: cat.label,
                icon: cat.icon,
                members: categorized[cat.key] || []
            }))
        });

        connectedClients.forEach(c => {
            if (c.readyState === WebSocket.OPEN) c.send(message);
        });
    } catch (error) {
        console.error('Error broadcasting team update:', error);
    }
}

async function broadcastStats() {
    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return;

        const memberCount = guild.memberCount;
        const onlineCount = guild.presences.cache.filter(
            p => p.status === 'online' || p.status === 'idle' || p.status === 'dnd'
        ).size;

        const message = JSON.stringify({
            type: 'stats_update',
            memberCount,
            onlineCount
        });

        connectedClients.forEach(c => {
            if (c.readyState === WebSocket.OPEN) c.send(message);
        });
    } catch (error) {
        console.error('Error broadcasting stats:', error);
    }
}

client.on('ready', () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
    console.log(`Bot is in ${client.guilds.cache.size} guilds`);
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) {
        console.log(`Found guild: ${guild.name} (${GUILD_ID})`);
        console.log(`Guild has ${guild.memberCount} members`);
    } else {
        console.error(`Guild not found: ${GUILD_ID}`);
        console.log(`   Available guilds: ${client.guilds.cache.map(g => `${g.name}(${g.id})`).join(', ')}`);
    }
    _botReadyResolve();
});

let _broadcastTimer = null;
function scheduleBroadcast() {
    if (_broadcastTimer) return;
    _broadcastTimer = setTimeout(async () => {
        _broadcastTimer = null;
        await broadcastTeamUpdate();
        await broadcastStats();
    }, 5000);
}

client.on('guildMemberAdd', scheduleBroadcast);
client.on('guildMemberRemove', scheduleBroadcast);
client.on('guildMemberUpdate', scheduleBroadcast);
client.on('presenceUpdate', scheduleBroadcast);

client.login(DISCORD_TOKEN);

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});