# Swaplyy

Exchange website with live Discord integration.

![preview](https://i.ibb.co/tMdJsjn1/grafik.png)

## Structure

```
.
├── index.html        Single page frontend
├── server.js         Express API, Discord bot and WebSocket server
├── schema.sql        MySQL schema for the vouches table
├── package.json
└── .env.example      Environment variable template
```

## Website

The frontend is a single page served by `server.js`. It shows the team, server stats and community vouches, and includes a fee overview with calculator, a getting started guide and the terms of service. The site is available in English, German, French, Spanish and Russian.

Replace the Discord invite link and the GitHub link in `index.html` with your own.

## Server

Requirements: Node.js 16.9 or newer and a MySQL database.

```bash
npm install
cp .env.example .env
npm start
```

For development with automatic restarts use `npm run dev`.

Fill in `.env` before starting:

| Variable        | Description                         |
| --------------- | ----------------------------------- |
| `DISCORD_TOKEN` | Discord bot token                   |
| `GUILD_ID`      | ID of your Discord server           |
| `PORT`          | Port of the server (default `3000`) |
| `NODE_ENV`      | `development` or `production`       |
| `DB_HOST`       | MySQL host                          |
| `DB_PORT`       | MySQL port (default `3306`)         |
| `DB_USER`       | MySQL user                          |
| `DB_PASSWORD`   | MySQL password                      |
| `DB_NAME`       | MySQL database name                 |

The bot needs the **Server Members** and **Presence** privileged intents enabled in the Discord Developer Portal.

Role IDs for the team sections are defined in `ROLE_CATEGORIES` at the top of `server.js`. Replace them with the role IDs of your own server.

## Database

Vouches are read from a `vouches` table. Create it with the included schema:

```bash
mysql -u your-database-user -p < schema.sql
```

The schema creates the database `x7_bot` and the `vouches` table. If you use another database name, change it in `schema.sql` and in `DB_NAME` in your `.env`.

Vouches are not created by this project. Your Discord bot has to insert them into the table.

### Endpoints

- `GET /api/health` returns the bot and guild status
- `GET /api/stats` returns the member, online and vouch counts
- `GET /api/team` returns the team members grouped by role category
- `GET /api/vouches` returns all vouches with Discord avatars
- `GET /api/vouches/:id` returns a single vouch
- `GET /api/db-test` tests the database connection

Live updates for the team and stats are pushed to the frontend over WebSocket.
