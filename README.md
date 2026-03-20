# vUPS Discord Bot

## Setup

### 1. Install dependencies
```
npm install
```

### 2. Set environment variables
Create a `.env` file or set these in Railway/Render:
```
BOT_TOKEN=your_new_bot_token_here
SUPABASE_KEY=your_new_service_role_key_here
CLIENT_ID=your_bot_client_id_here
```

Get CLIENT_ID from: discord.com/developers → your app → General Information → Application ID

### 3. Register slash commands
```
node deploy-commands.js
```
Run this once. Commands take up to 1 hour to appear globally.

### 4. Start the bot
```
npm start
```

## Hosting free on Railway
1. Go to railway.app → New Project → Deploy from GitHub
2. Push this folder to a GitHub repo first
3. Add the environment variables in Railway dashboard
4. Deploy

## Commands
- `/status` — live vUPS stats
- `/trips` — open trips to bid on
- `/leaderboard` — top freight haulers
- `/mypireps name:YourName` — your PIREP history
- `/pirep` — file a PIREP from Discord
