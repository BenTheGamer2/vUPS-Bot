const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// ── Config ────────────────────────────────────────────────────────────────────
const BOT_TOKEN     = process.env.BOT_TOKEN     || 'YOUR_BOT_TOKEN_HERE';
const SUPABASE_URL  = 'https://mpmvfqkmvvbnsqvtvlnu.supabase.co';
const SUPABASE_KEY  = process.env.SUPABASE_KEY  || 'YOUR_SERVICE_ROLE_KEY_HERE';
const PIREP_CHANNEL = '1484574499335831673';

// ── Clients ───────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getState() {
  const { data, error } = await db.from('state').select('value').eq('key', 'main').single();
  if (error || !data) return null;
  return data.value;
}

function formatLbs(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M lbs';
  return n.toLocaleString() + ' lbs';
}

function btDisplay(bt) {
  if (!bt) return '—';
  const h = Math.floor(bt), m = Math.round((bt % 1) * 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Bot ready ─────────────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ vUPS Bot online as ${client.user.tag}`);
  client.user.setActivity('UPS flights', { type: ActivityType.Watching });
});

// ── Slash command handler ─────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply();

  const { commandName } = interaction;

  // ── /status ──────────────────────────────────────────────────────────────────
  if (commandName === 'status') {
    const snap = await getState();
    if (!snap) return interaction.editReply('❌ Could not connect to vUPS database.');

    const crew = (snap.pilots || []).filter(p => p.type !== 'ai').length;
    const pireps = (snap.pireps || []).length;
    const freight = (snap.pireps || []).reduce((a, p) => a + (Number(p.payload) || 0), 0);
    const treasury = Number(snap.treasury) || 0;

    const embed = new EmbedBuilder()
      .setColor(0xC8920A)
      .setTitle('📦 vUPS Operations Status')
      .setThumbnail('https://virtual-ups.vercel.app/favicon.ico')
      .addFields(
        { name: '👥 Crew', value: crew.toString(), inline: true },
        { name: '✅ PIREPs Filed', value: pireps.toString(), inline: true },
        { name: '📦 Total Freight', value: formatLbs(freight), inline: true },
        { name: '💰 Treasury', value: '$' + treasury.toLocaleString(), inline: true },
      )
      .setFooter({ text: 'virtual-ups.vercel.app' })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  // ── /trips ────────────────────────────────────────────────────────────────────
  if (commandName === 'trips') {
    const snap = await getState();
    const trips = (snap?.trips || []).filter(t => t.status === 'open');

    if (!trips.length) {
      return interaction.editReply('No open trips right now. Check back later or ask admin to post some.');
    }

    const embed = new EmbedBuilder()
      .setColor(0x2D9E5F)
      .setTitle('✈️ Open Trips — Bid at virtual-ups.vercel.app')
      .setDescription('Sign in to the ops portal to place your bid.');

    trips.slice(0, 10).forEach(t => {
      const bids = (t.bids || []).length;
      embed.addFields({
        name: `${t.fn}  ${t.orig} → ${t.dest}`,
        value: `${t.aircraft}\n📅 ${t.date || '—'}  🕐 ${t.dep || '—'}Z\n👤 ${bids} bid${bids !== 1 ? 's' : ''}${t.notes ? '\n📝 ' + t.notes : ''}`,
        inline: true,
      });
    });

    embed.setFooter({ text: 'virtual-ups.vercel.app' });
    return interaction.editReply({ embeds: [embed] });
  }

  // ── /leaderboard ──────────────────────────────────────────────────────────────
  if (commandName === 'leaderboard') {
    const snap = await getState();
    const pireps = snap?.pireps || [];

    if (!pireps.length) {
      return interaction.editReply('No PIREPs filed yet — be the first!');
    }

    const totals = {};
    const flights = {};
    pireps.forEach(p => {
      const name = p.pilot || 'Unknown';
      totals[name] = (totals[name] || 0) + (Number(p.payload) || 0);
      flights[name] = (flights[name] || 0) + 1;
    });

    const ranked = Object.entries(totals)
      .map(([name, lbs]) => ({ name, lbs, flights: flights[name] }))
      .sort((a, b) => b.lbs - a.lbs)
      .slice(0, 10);

    const medals = ['🥇', '🥈', '🥉'];
    const rows = ranked.map((p, i) =>
      `${medals[i] || `**#${i + 1}**`} **${p.name}** — ${formatLbs(p.lbs)} · ${p.flights} flight${p.flights !== 1 ? 's' : ''}`
    ).join('\n');

    const embed = new EmbedBuilder()
      .setColor(0xC8920A)
      .setTitle('🏆 vUPS Top Freight Haulers')
      .setDescription(rows)
      .setFooter({ text: 'Based on filed PIREPs · virtual-ups.vercel.app' })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  // ── /mypireps ─────────────────────────────────────────────────────────────────
  if (commandName === 'mypireps') {
    const name = interaction.options.getString('name');
    const snap = await getState();
    const pireps = (snap?.pireps || []).filter(p =>
      (p.pilot || '').toLowerCase() === name.toLowerCase()
    );

    if (!pireps.length) {
      return interaction.editReply(`No PIREPs found for **${name}**. Make sure the name matches your display name on the portal.`);
    }

    const totalLbs = pireps.reduce((a, p) => a + (Number(p.payload) || 0), 0);
    const totalHrs = pireps.reduce((a, p) => a + (parseFloat(p.bt) || 0), 0);

    const embed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle(`✈️ PIREPs for ${name}`)
      .setDescription(
        `**${pireps.length}** flights · **${totalHrs.toFixed(1)}h** block · **${formatLbs(totalLbs)}** hauled`
      );

    pireps.slice(-5).reverse().forEach(p => {
      embed.addFields({
        name: `${p.fn || '—'}  ${p.orig || '?'} → ${p.dest || '?'}`,
        value: `${p.ac || '—'} · ${btDisplay(p.bt)} · ${formatLbs(p.payload)}${p.ldgrate ? ' · ' + p.ldgrate + ' fpm' : ''}`,
        inline: false,
      });
    });

    if (pireps.length > 5) embed.setFooter({ text: `Showing last 5 of ${pireps.length} PIREPs` });
    return interaction.editReply({ embeds: [embed] });
  }

  // ── /pirep ────────────────────────────────────────────────────────────────────
  if (commandName === 'pirep') {
    const fn      = interaction.options.getString('flight').toUpperCase();
    const orig    = interaction.options.getString('origin').toUpperCase();
    const dest    = interaction.options.getString('destination').toUpperCase();
    const ac      = interaction.options.getString('aircraft');
    const bt      = interaction.options.getNumber('blocktime');
    const payload = interaction.options.getInteger('payload');
    const ldg     = interaction.options.getInteger('landingrate') || 0;
    const pilot   = interaction.options.getString('name');
    const date    = new Date().toISOString().split('T')[0];

    const pirep = { fn, date, orig, dest, ac, bt: bt.toFixed(1), payload, ldgrate: ldg, pilot, filed: Date.now(), remarks: '' };

    // Load current state, add pirep, save back
    const snap = await getState();
    if (!snap) return interaction.editReply('❌ Could not connect to database.');
    snap.pireps = [...(snap.pireps || []), pirep];
    const { error } = await db.from('state').upsert(
      { key: 'main', value: snap, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

    if (error) return interaction.editReply('❌ Failed to save PIREP: ' + error.message);

    // Post to pirep log channel
    const pirepChannel = client.channels.cache.get(PIREP_CHANNEL);
    if (pirepChannel) {
      const embed = new EmbedBuilder()
        .setColor(0x2D9E5F)
        .setTitle(`✅ PIREP Filed — ${fn}`)
        .addFields(
          { name: 'Pilot',       value: pilot,                  inline: true },
          { name: 'Route',       value: `${orig} → ${dest}`,    inline: true },
          { name: 'Aircraft',    value: ac,                      inline: true },
          { name: 'Block Time',  value: btDisplay(bt),           inline: true },
          { name: 'Payload',     value: formatLbs(payload),      inline: true },
          { name: 'Landing Rate',value: ldg ? ldg + ' fpm' : '—', inline: true },
        )
        .setTimestamp();
      pirepChannel.send({ embeds: [embed] });
    }

    return interaction.editReply(`✅ PIREP filed for **${fn}** — ${orig} → ${dest} · ${formatLbs(payload)}`);
  }
});

client.login(BOT_TOKEN);
