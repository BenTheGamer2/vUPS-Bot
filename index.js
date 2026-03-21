const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, PermissionFlagsBits } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const BOT_TOKEN     = process.env.BOT_TOKEN     || '';
const SUPABASE_URL  = process.env.SUPABASE_URL  || 'https://mpmvfqkmvvbnsqvtvlnu.supabase.co';
const SUPABASE_KEY  = process.env.SUPABASE_KEY  || '';
const PIREP_CHANNEL = '1484574499335831673';
const SUGGEST_CHANNEL = process.env.SUGGEST_CHANNEL || PIREP_CHANNEL;

if (!BOT_TOKEN)    { console.error('BOT_TOKEN not set');    process.exit(1); }
if (!SUPABASE_KEY) { console.error('SUPABASE_KEY not set'); process.exit(1); }

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

const db = createClient(SUPABASE_URL, SUPABASE_KEY);
const warnings = {};
const birthdays = {};

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getState() {
  const { data, error } = await db.from('state').select('value').eq('key', 'main').single();
  if (error || !data) return null;
  return data.value;
}

async function savePirep(pirep, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const snap = await getState();
    if (!snap) throw new Error('Could not read state');
    const existing = snap.pireps || [];
    if (existing.some(p => p.fn === pirep.fn && p.filed === pirep.filed)) return;
    snap.pireps = [...existing, pirep];
    const { error } = await db.from('state').upsert(
      { key: 'main', value: snap, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    if (!error) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Failed to save PIREP after retries');
}

function formatLbs(n) {
  n = Number(n) || 0;
  return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M lbs' : n.toLocaleString() + ' lbs';
}

function btDisplay(bt) {
  bt = parseFloat(bt);
  if (!bt) return '—';
  const h = Math.floor(bt), m = Math.round((bt % 1) * 60);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

function isStaff(member) {
  return member.permissions.has(PermissionFlagsBits.ManageMessages) ||
         member.permissions.has(PermissionFlagsBits.Administrator);
}

async function fetchMetar(icao) {
  try {
    const res = await fetch('https://metar.vatsim.net/metar.php?id=' + icao.toUpperCase());
    if (!res.ok) return null;
    return (await res.text()).trim() || null;
  } catch { return null; }
}

function parseFlightCat(raw) {
  if (!raw) return { cat: 'UNKN', color: 0x888888 };
  let ceiling = 9999, vis = 10;
  const layers = [...raw.matchAll(/\b(BKN|OVC)(\d{3})\b/g)];
  for (const l of layers) { const alt = parseInt(l[2]) * 100; if (alt < ceiling) ceiling = alt; }
  const visM = raw.match(/\s(\d+)SM\b/);
  if (visM) vis = parseFloat(visM[1]);
  const fracM = raw.match(/\s(\d+)\/(\d+)SM\b/);
  if (fracM) vis = parseInt(fracM[1]) / parseInt(fracM[2]);
  if (/\bCAVOK\b/.test(raw)) return { cat: 'VFR', color: 0x2D9E5F };
  if (ceiling < 500  || vis < 1) return { cat: 'LIFR', color: 0xC03A2B };
  if (ceiling < 1000 || vis < 3) return { cat: 'IFR',  color: 0xE74C3C };
  if (ceiling < 3000 || vis < 5) return { cat: 'MVFR', color: 0x3498DB };
  return { cat: 'VFR', color: 0x2D9E5F };
}

function toPhonetic(text) {
  const alpha = {
    A:'Alpha',B:'Bravo',C:'Charlie',D:'Delta',E:'Echo',F:'Foxtrot',G:'Golf',
    H:'Hotel',I:'India',J:'Juliet',K:'Kilo',L:'Lima',M:'Mike',N:'November',
    O:'Oscar',P:'Papa',Q:'Quebec',R:'Romeo',S:'Sierra',T:'Tango',U:'Uniform',
    V:'Victor',W:'Whiskey',X:'X-ray',Y:'Yankee',Z:'Zulu',
    '0':'Zero','1':'One','2':'Two','3':'Three','4':'Four',
    '5':'Five','6':'Six','7':'Seven','8':'Eight','9':'Niner'
  };
  return text.toUpperCase().split('').map(c => alpha[c] || c).join(' · ');
}

const FAR_FACTS = [
  'FAR 91.3 — The pilot in command is directly responsible for and is the final authority on the operation of the aircraft.',
  'FAR 91.13 — No person may operate an aircraft in a careless or reckless manner so as to endanger the life or property of another.',
  'FAR 91.155 — Basic VFR weather minimums require 3 statute miles visibility in Class G airspace below 1,200 ft AGL.',
  'FAR 91.117 — No person may operate an aircraft below 10,000 ft MSL at an indicated airspeed of more than 250 knots.',
  'FAR 91.119 — Minimum safe altitudes: 1,000 ft over congested areas, 500 ft over open water or sparsely populated areas.',
  'FAR 91.121 — Altimeter settings: below 18,000 ft MSL use the current reported altimeter setting of a station within 100 NM.',
  'FAR 91.209 — Aircraft position lights must be on from sunset to sunrise.',
  'FAR 91.403 — The owner or operator of an aircraft is primarily responsible for maintaining it in an airworthy condition.',
  'AIM 4-2-4 — Aircraft on final approach have the right of way over other aircraft in flight or on the surface.',
  'FAR 121.542 — The sterile cockpit rule prohibits non-essential activities below 10,000 ft.',
  'FAR 91.185 — In IMC, lost comms: fly AVE F — Assigned, Vectored, Expected, Filed routes at MEA or assigned altitude.',
  'FAR 91.411 — Altimeter and static system must be inspected every 24 calendar months for IFR flight.',
];

// ── Ready ─────────────────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log('vUPS Bot online as ' + client.user.tag);
  client.user.setActivity('UPS flights', { type: ActivityType.Watching });

  // Daily birthday check at 08:00 UTC
  setInterval(async () => {
    const now = new Date();
    if (now.getUTCHours() === 8 && now.getUTCMinutes() === 0) {
      const today = (now.getUTCMonth()+1) + '/' + now.getUTCDate();
      for (const [userId, data] of Object.entries(birthdays)) {
        if (data.date === today) {
          try {
            const ch = client.channels.cache.get(PIREP_CHANNEL);
            if (ch) {
              const embed = new EmbedBuilder().setColor(0xC8920A)
                .setTitle('🎂 Happy Birthday!')
                .setDescription('Wishing **' + data.name + '** a wonderful birthday from the entire vUPS team!')
                .setFooter({ text: 'Virtual UPS Airlines' }).setTimestamp();
              ch.send({ content: '<@' + userId + '>', embeds: [embed] });
            }
          } catch {}
        }
      }
    }
  }, 60000);
});

// ── Commands ──────────────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await interaction.deferReply();
    const cmd = interaction.commandName;
    const member = interaction.member;

    // ── /status ───────────────────────────────────────────────────────────────
    if (cmd === 'status') {
      const snap = await getState();
      if (!snap) return interaction.editReply('Could not connect to database.');
      const crew    = (snap.pilots || []).filter(p => p.type !== 'ai').length;
      const pireps  = (snap.pireps || []).length;
      const freight = (snap.pireps || []).reduce((a, p) => a + (Number(p.payload) || 0), 0);
      const embed = new EmbedBuilder().setColor(0xC8920A).setTitle('📦 vUPS Operations Status')
        .addFields(
          { name: 'Crew',          value: crew.toString(),    inline: true },
          { name: 'PIREPs Filed',  value: pireps.toString(),  inline: true },
          { name: 'Total Freight', value: formatLbs(freight), inline: true },
          { name: 'Treasury',      value: '$' + (Number(snap.treasury)||0).toLocaleString(), inline: true }
        ).setFooter({ text: 'virtual-ups.vercel.app' }).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /trips ────────────────────────────────────────────────────────────────
    if (cmd === 'trips') {
      const snap  = await getState();
      const trips = (snap?.trips || []).filter(t => t.status === 'open');
      if (!trips.length) return interaction.editReply('No open trips right now.');
      const embed = new EmbedBuilder().setColor(0x2D9E5F).setTitle('✈️ Open Trips')
        .setDescription('Bid at virtual-ups.vercel.app');
      trips.slice(0, 10).forEach(t => {
        const bids = (t.bids || []).length;
        embed.addFields({
          name: t.fn + '  ' + t.orig + ' → ' + t.dest,
          value: t.aircraft + '\n' + (t.date||'—') + '  ' + (t.dep||'—') + 'Z\n' + bids + ' bid' + (bids!==1?'s':'') + (t.notes?'\n'+t.notes:''),
          inline: true
        });
      });
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /leaderboard ──────────────────────────────────────────────────────────
    if (cmd === 'leaderboard') {
      const snap   = await getState();
      const pireps = snap?.pireps || [];
      if (!pireps.length) return interaction.editReply('No PIREPs filed yet.');
      const totals = {}, flights = {};
      pireps.forEach(p => {
        const n = p.pilot || 'Unknown';
        totals[n]  = (totals[n]  || 0) + (Number(p.payload) || 0);
        flights[n] = (flights[n] || 0) + 1;
      });
      const ranked = Object.entries(totals)
        .map(([name, lbs]) => ({ name, lbs, flights: flights[name] }))
        .sort((a, b) => b.lbs - a.lbs).slice(0, 10);
      const medals = ['🥇','🥈','🥉'];
      const rows = ranked.map((p,i) =>
        (medals[i]||'**#'+(i+1)+'**') + ' **' + p.name + '** — ' + formatLbs(p.lbs) + ' · ' + p.flights + ' flight' + (p.flights!==1?'s':'')
      ).join('\n');
      const embed = new EmbedBuilder().setColor(0xC8920A).setTitle('🏆 Top Freight Haulers')
        .setDescription(rows).setFooter({ text: 'virtual-ups.vercel.app' }).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /roster ───────────────────────────────────────────────────────────────
    if (cmd === 'roster') {
      const snap   = await getState();
      const pilots = (snap?.pilots || []).filter(p => p.type !== 'ai');
      if (!pilots.length) return interaction.editReply('No crew members yet.');
      const embed = new EmbedBuilder().setColor(0xC8920A).setTitle('👥 vUPS Crew Roster');
      pilots.forEach(p => {
        const name = ((p.first||'') + ' ' + (p.last||'')).trim() || 'Unknown';
        embed.addFields({ name, value: p.rank + ' · ' + p.base + ' · ' + (p.hours||0) + 'h', inline: true });
      });
      embed.setFooter({ text: 'virtual-ups.vercel.app' });
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /mypireps ─────────────────────────────────────────────────────────────
    if (cmd === 'mypireps') {
      const name   = interaction.options.getString('name');
      const snap   = await getState();
      const pireps = (snap?.pireps || []).filter(p => (p.pilot||'').toLowerCase() === name.toLowerCase());
      if (!pireps.length) return interaction.editReply('No PIREPs found for **' + name + '**.');
      const totalLbs = pireps.reduce((a,p) => a + (Number(p.payload)||0), 0);
      const totalHrs = pireps.reduce((a,p) => a + (parseFloat(p.bt)||0), 0);
      const embed = new EmbedBuilder().setColor(0x3498DB).setTitle('✈️ PIREPs for ' + name)
        .setDescription(pireps.length + ' flights · ' + totalHrs.toFixed(1) + 'h · ' + formatLbs(totalLbs));
      pireps.slice(-5).reverse().forEach(p => {
        embed.addFields({
          name: (p.fn||'—') + '  ' + (p.orig||'?') + ' → ' + (p.dest||'?'),
          value: (p.ac||'—') + ' · ' + btDisplay(p.bt) + ' · ' + formatLbs(p.payload) + (p.ldgrate?' · '+p.ldgrate+' fpm':''),
          inline: false
        });
      });
      if (pireps.length > 5) embed.setFooter({ text: 'Showing last 5 of ' + pireps.length });
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /pirep ────────────────────────────────────────────────────────────────
    if (cmd === 'pirep') {
      const pilot   = interaction.options.getString('name');
      const fn      = interaction.options.getString('flight').toUpperCase();
      const orig    = interaction.options.getString('origin').toUpperCase();
      const dest    = interaction.options.getString('destination').toUpperCase();
      const ac      = interaction.options.getString('aircraft');
      const bt      = interaction.options.getNumber('blocktime');
      const payload = interaction.options.getInteger('payload');
      const ldg     = interaction.options.getInteger('landingrate') || 0;
      const date    = new Date().toISOString().split('T')[0];
      const pirep   = { fn, date, orig, dest, ac, bt: bt.toFixed(1), payload, ldgrate: ldg, pilot, filed: Date.now(), remarks: '' };
      await savePirep(pirep);
      const ch = client.channels.cache.get(PIREP_CHANNEL);
      if (ch) {
        const embed = new EmbedBuilder().setColor(0x2D9E5F).setTitle('✅ PIREP Filed — ' + fn)
          .addFields(
            { name: 'Pilot',        value: pilot,                  inline: true },
            { name: 'Route',        value: orig + ' → ' + dest,    inline: true },
            { name: 'Aircraft',     value: ac,                     inline: true },
            { name: 'Block Time',   value: btDisplay(bt),          inline: true },
            { name: 'Payload',      value: formatLbs(payload),     inline: true },
            { name: 'Landing Rate', value: ldg ? ldg+' fpm' : '—', inline: true }
          ).setTimestamp();
        ch.send({ embeds: [embed] });
      }
      return interaction.editReply('✅ PIREP filed — **' + fn + '** ' + orig + ' → ' + dest + ' · ' + formatLbs(payload));
    }

    // ── /weather ──────────────────────────────────────────────────────────────
    if (cmd === 'weather') {
      const dep = interaction.options.getString('departure').toUpperCase();
      const arr = interaction.options.getString('arrival').toUpperCase();
      const [depRaw, arrRaw] = await Promise.all([fetchMetar(dep), fetchMetar(arr)]);
      const depCat = parseFlightCat(depRaw);
      const arrCat = parseFlightCat(arrRaw);
      const embed = new EmbedBuilder().setColor(depCat.color).setTitle('🌤 Weather Briefing — ' + dep + ' → ' + arr)
        .addFields(
          { name: dep + ' (' + depCat.cat + ')', value: depRaw ? '```' + depRaw + '```' : 'No data', inline: false },
          { name: arr + ' (' + arrCat.cat + ')', value: arrRaw ? '```' + arrRaw + '```' : 'No data', inline: false },
        ).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /metar ────────────────────────────────────────────────────────────────
    if (cmd === 'metar') {
      const icao = interaction.options.getString('icao').toUpperCase();
      const raw  = await fetchMetar(icao);
      if (!raw) return interaction.editReply('No METAR found for **' + icao + '**.');
      const { cat, color } = parseFlightCat(raw);
      const embed = new EmbedBuilder().setColor(color).setTitle('🌤 METAR — ' + icao)
        .setDescription('```' + raw + '```')
        .addFields({ name: 'Flight Category', value: cat, inline: true })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /atis ─────────────────────────────────────────────────────────────────
    if (cmd === 'atis') {
      const icao = interaction.options.getString('icao').toUpperCase();
      const raw  = await fetchMetar(icao);
      if (!raw) return interaction.editReply('No METAR found for **' + icao + '**.');
      const { cat } = parseFlightCat(raw);
      const windM  = raw.match(/(\d{3})(\d{2})(G\d+)?KT/);
      const visM   = raw.match(/(\d+)SM/);
      const tempM  = raw.match(/(\d+)\/(\d+)/);
      const altM   = raw.match(/A(\d{4})/);
      const wind   = windM ? windM[1] + ' at ' + windM[2] + (windM[3]?' gusting '+windM[3].replace('G',''):'') + ' knots' : 'calm';
      const vis    = visM  ? visM[1] + ' statute miles' : 'not available';
      const temp   = tempM ? tempM[1] + ' degrees Celsius, dewpoint ' + tempM[2] : 'not available';
      const alt    = altM  ? (altM[1][0]+altM[1][1]+'.'+altM[1][2]+altM[1][3]) : 'not available';
      const info   = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      const embed = new EmbedBuilder().setColor(0x3498DB).setTitle('📻 ATIS — ' + icao + ' Information ' + info)
        .setDescription(
          icao + ' Information ' + info + '.\n' +
          'Wind ' + wind + '.\n' +
          'Visibility ' + vis + '.\n' +
          'Temperature ' + temp + '.\n' +
          'Altimeter ' + alt + '.\n' +
          'Flight category ' + cat + '.\n' +
          'Advise on initial contact you have information ' + info + '.'
        ).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /hub ──────────────────────────────────────────────────────────────────
    if (cmd === 'hub') {
      const snap = await getState();
      const icao = interaction.options.getString('icao').toUpperCase();
      const hubs = snap?.hubs || [];
      const hub  = hubs.find(h => h.icao === icao);
      if (!hub) return interaction.editReply('No vUPS hub found for **' + icao + '**.');
      const embed = new EmbedBuilder().setColor(0xC8920A).setTitle('📦 ' + hub.name + ' — ' + icao)
        .addFields(
          { name: 'Type',     value: hub.type     || '—', inline: true },
          { name: 'Aircraft', value: hub.aircraft  || '—', inline: true },
          { name: 'Ramp',     value: (hub.ramp||0) + ' positions', inline: true },
          { name: 'Active',   value: (hub.active||0) + 'h ops', inline: true },
        ).setFooter({ text: 'virtual-ups.vercel.app' });
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /phonetic ─────────────────────────────────────────────────────────────
    if (cmd === 'phonetic') {
      const text   = interaction.options.getString('text');
      const result = toPhonetic(text);
      const embed  = new EmbedBuilder().setColor(0xC8920A).setTitle('📻 NATO Phonetic')
        .addFields(
          { name: 'Input',    value: text.toUpperCase(), inline: false },
          { name: 'Phonetic', value: result,             inline: false }
        );
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /flightrule ───────────────────────────────────────────────────────────
    if (cmd === 'flightrule') {
      const fact  = FAR_FACTS[Math.floor(Math.random() * FAR_FACTS.length)];
      const embed = new EmbedBuilder().setColor(0xC8920A).setTitle('📖 FAR/AIM — Rule of the Day')
        .setDescription(fact).setFooter({ text: 'For simulation purposes only' }).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /poll ─────────────────────────────────────────────────────────────────
    if (cmd === 'poll') {
      if (!isStaff(member)) return interaction.editReply({ content: '❌ Staff only.', ephemeral: true });
      const question = interaction.options.getString('question');
      const opt1     = interaction.options.getString('option1') || 'Yes';
      const opt2     = interaction.options.getString('option2') || 'No';
      const opt3     = interaction.options.getString('option3');
      const opt4     = interaction.options.getString('option4');
      const options  = [opt1, opt2, opt3, opt4].filter(Boolean);
      const emojis   = ['1️⃣','2️⃣','3️⃣','4️⃣'];
      const embed = new EmbedBuilder().setColor(0xC8920A).setTitle('📊 ' + question)
        .setDescription(options.map((o,i) => emojis[i] + ' ' + o).join('\n\n'))
        .setFooter({ text: 'React below to vote · Virtual UPS Airlines' }).setTimestamp();
      const msg = await interaction.editReply({ embeds: [embed] });
      const fullMsg = await interaction.fetchReply();
      for (let i = 0; i < options.length; i++) await fullMsg.react(emojis[i]);
    }

    // ── /suggest ──────────────────────────────────────────────────────────────
    if (cmd === 'suggest') {
      const suggestion = interaction.options.getString('suggestion');
      const embed = new EmbedBuilder().setColor(0x3498DB).setTitle('💡 New Suggestion')
        .setDescription(suggestion)
        .addFields({ name: 'Submitted by', value: member.user.username + ' (' + member.user.id + ')', inline: true })
        .setTimestamp();
      const ch = client.channels.cache.get(SUGGEST_CHANNEL);
      if (ch) {
        const msg = await ch.send({ embeds: [embed] });
        await msg.react('👍');
        await msg.react('👎');
      }
      return interaction.editReply({ content: '✅ Your suggestion has been submitted to staff. Thank you!', ephemeral: true });
    }

    // ── /report ───────────────────────────────────────────────────────────────
    if (cmd === 'report') {
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason');
      const embed  = new EmbedBuilder().setColor(0xE74C3C).setTitle('🚨 Member Report')
        .addFields(
          { name: 'Reported User', value: target.user.username + ' (' + target.user.id + ')', inline: true },
          { name: 'Reported By',   value: member.user.username,                               inline: true },
          { name: 'Reason',        value: reason,                                             inline: false },
        ).setTimestamp();
      const ch = client.channels.cache.get(SUGGEST_CHANNEL);
      if (ch) ch.send({ embeds: [embed] });
      return interaction.editReply({ content: '✅ Your report has been submitted to staff privately.', ephemeral: true });
    }

    // ── /setbirthday ──────────────────────────────────────────────────────────
    if (cmd === 'setbirthday') {
      const month = interaction.options.getInteger('month');
      const day   = interaction.options.getInteger('day');
      const name  = member.displayName;
      birthdays[member.user.id] = { date: month + '/' + day, name };
      return interaction.editReply({ content: '✅ Birthday set to ' + month + '/' + day + '. We will celebrate you! 🎂', ephemeral: true });
    }

    // ── /slowmode ─────────────────────────────────────────────────────────────
    if (cmd === 'slowmode') {
      if (!isStaff(member)) return interaction.editReply({ content: '❌ Staff only.', ephemeral: true });
      const seconds = interaction.options.getInteger('seconds');
      await interaction.channel.setRateLimitPerUser(seconds);
      return interaction.editReply('✅ Slowmode set to ' + seconds + ' seconds.');
    }

    // ── /lock ─────────────────────────────────────────────────────────────────
    if (cmd === 'lock') {
      if (!isStaff(member)) return interaction.editReply({ content: '❌ Staff only.', ephemeral: true });
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
      const embed = new EmbedBuilder().setColor(0xE74C3C).setTitle('🔒 Channel Locked')
        .setDescription('This channel has been locked by staff.')
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /unlock ───────────────────────────────────────────────────────────────
    if (cmd === 'unlock') {
      if (!isStaff(member)) return interaction.editReply({ content: '❌ Staff only.', ephemeral: true });
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
      const embed = new EmbedBuilder().setColor(0x2D9E5F).setTitle('🔓 Channel Unlocked')
        .setDescription('This channel has been unlocked.')
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /whois ────────────────────────────────────────────────────────────────
    if (cmd === 'whois') {
      const target  = interaction.options.getMember('user') || member;
      const user    = target.user;
      const joined  = target.joinedAt ? '<t:' + Math.floor(target.joinedAt.getTime()/1000) + ':R>' : '—';
      const created = '<t:' + Math.floor(user.createdAt.getTime()/1000) + ':R>';
      const roles   = target.roles.cache.filter(r => r.name !== '@everyone').map(r => r.toString()).join(', ') || 'None';
      const embed   = new EmbedBuilder().setColor(0xC8920A).setTitle('👤 ' + user.username)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: 'Display Name',    value: target.displayName, inline: true },
          { name: 'ID',              value: user.id,            inline: true },
          { name: 'Joined Server',   value: joined,             inline: true },
          { name: 'Account Created', value: created,            inline: true },
          { name: 'Roles',           value: roles,              inline: false },
        ).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /serverinfo ───────────────────────────────────────────────────────────
    if (cmd === 'serverinfo') {
      const guild = interaction.guild;
      await guild.fetch();
      const embed = new EmbedBuilder().setColor(0xC8920A).setTitle('🖥 ' + guild.name)
        .setThumbnail(guild.iconURL())
        .addFields(
          { name: 'Members',  value: guild.memberCount.toString(),                                    inline: true },
          { name: 'Owner',    value: '<@' + guild.ownerId + '>',                                      inline: true },
          { name: 'Created',  value: '<t:' + Math.floor(guild.createdAt.getTime()/1000) + ':R>',      inline: true },
          { name: 'Channels', value: guild.channels.cache.size.toString(),                            inline: true },
          { name: 'Roles',    value: guild.roles.cache.size.toString(),                               inline: true },
          { name: 'Boosts',   value: (guild.premiumSubscriptionCount||0).toString(),                  inline: true },
        ).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /membercount ──────────────────────────────────────────────────────────
    if (cmd === 'membercount') {
      const guild = interaction.guild;
      await guild.fetch();
      const embed = new EmbedBuilder().setColor(0xC8920A)
        .setTitle('👥 ' + guild.name + ' — Member Count')
        .setDescription('**' + guild.memberCount + '** members').setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /warn ─────────────────────────────────────────────────────────────────
    if (cmd === 'warn') {
      if (!isStaff(member)) return interaction.editReply({ content: '❌ Staff only.', ephemeral: true });
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      if (!warnings[target.id]) warnings[target.id] = [];
      warnings[target.id].push({ reason, by: member.user.username, at: new Date().toISOString() });
      const count = warnings[target.id].length;
      const dmEmbed = new EmbedBuilder().setColor(0xE67E22)
        .setTitle('⚠️ You have received a warning — Virtual UPS Airlines')
        .addFields(
          { name: 'Reason',         value: reason,               inline: false },
          { name: 'Issued By',      value: member.user.username, inline: true  },
          { name: 'Total Warnings', value: count.toString(),     inline: true  },
        )
        .setDescription('Please review the server rules to avoid further action.')
        .setFooter({ text: 'Virtual UPS Airlines · virtual-ups.vercel.app' }).setTimestamp();
      try { await target.user.send({ embeds: [dmEmbed] }); } catch {}
      const embed = new EmbedBuilder().setColor(0xE67E22).setTitle('⚠️ Warning Issued')
        .addFields(
          { name: 'User',           value: target.toString(), inline: true },
          { name: 'Reason',         value: reason,            inline: true },
          { name: 'Total Warnings', value: count.toString(),  inline: true },
          { name: 'DM Sent',        value: 'Yes',             inline: true },
        ).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /warnings ─────────────────────────────────────────────────────────────
    if (cmd === 'warnings') {
      if (!isStaff(member)) return interaction.editReply({ content: '❌ Staff only.', ephemeral: true });
      const target = interaction.options.getMember('user');
      const list   = warnings[target.id] || [];
      if (!list.length) return interaction.editReply(target.toString() + ' has no warnings.');
      const embed  = new EmbedBuilder().setColor(0xE67E22).setTitle('⚠️ Warnings — ' + target.user.username)
        .setDescription(list.map((w,i) => '**' + (i+1) + '.** ' + w.reason + ' — by ' + w.by).join('\n'));
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /clearwarnings ────────────────────────────────────────────────────────
    if (cmd === 'clearwarnings') {
      if (!isStaff(member)) return interaction.editReply({ content: '❌ Staff only.', ephemeral: true });
      const target = interaction.options.getMember('user');
      warnings[target.id] = [];
      return interaction.editReply('✅ Warnings cleared for ' + target.toString());
    }

    // ── /kick ─────────────────────────────────────────────────────────────────
    if (cmd === 'kick') {
      if (!isStaff(member)) return interaction.editReply({ content: '❌ Staff only.', ephemeral: true });
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await target.kick(reason);
      return interaction.editReply('✅ **' + target.user.username + '** has been kicked. Reason: ' + reason);
    }

    // ── /ban ──────────────────────────────────────────────────────────────────
    if (cmd === 'ban') {
      if (!isStaff(member)) return interaction.editReply({ content: '❌ Staff only.', ephemeral: true });
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await target.ban({ reason });
      return interaction.editReply('✅ **' + target.user.username + '** has been banned. Reason: ' + reason);
    }

    // ── /unban ────────────────────────────────────────────────────────────────
    if (cmd === 'unban') {
      if (!isStaff(member)) return interaction.editReply({ content: '❌ Staff only.', ephemeral: true });
      const userId = interaction.options.getString('userid');
      await interaction.guild.members.unban(userId);
      return interaction.editReply('✅ User **' + userId + '** has been unbanned.');
    }

    // ── /purge ────────────────────────────────────────────────────────────────
    if (cmd === 'purge') {
      if (!isStaff(member)) return interaction.editReply({ content: '❌ Staff only.', ephemeral: true });
      const amount  = interaction.options.getInteger('amount');
      const deleted = await interaction.channel.bulkDelete(amount, true);
      return interaction.editReply({ content: '✅ Deleted ' + deleted.size + ' messages.', ephemeral: true });
    }

    // ── /announce ─────────────────────────────────────────────────────────────
    if (cmd === 'announce') {
      if (!isStaff(member)) return interaction.editReply({ content: '❌ Staff only.', ephemeral: true });
      const title   = interaction.options.getString('title');
      const message = interaction.options.getString('message');
      const ping    = interaction.options.getString('ping') || 'none';
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const embed   = new EmbedBuilder().setColor(0xC8920A).setTitle('📣 ' + title).setDescription(message)
        .setFooter({ text: 'Virtual UPS Airlines · virtual-ups.vercel.app' }).setTimestamp();
      let content = '';
      if (ping === 'everyone') content = '@everyone';
      else if (ping === 'here') content = '@here';
      await channel.send({ content: content || undefined, embeds: [embed] });
      return interaction.editReply({ content: '✅ Announcement posted in ' + channel.toString(), ephemeral: true });
    }

    // ── /hiring ───────────────────────────────────────────────────────────────
    if (cmd === 'hiring') {
      if (!isStaff(member)) return interaction.editReply({ content: '❌ Staff only.', ephemeral: true });
      const role    = interaction.options.getString('role');
      const details = interaction.options.getString('details') || '';
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const embed   = new EmbedBuilder().setColor(0xC8920A).setTitle('📦 vUPS is Hiring — ' + role)
        .setDescription((details ? details + '\n\n' : '') + 'Open a ticket to apply.')
        .setFooter({ text: 'Virtual UPS Airlines · Est. 2026' }).setTimestamp();
      await channel.send({ embeds: [embed] });
      return interaction.editReply({ content: '✅ Hiring post sent to ' + channel.toString(), ephemeral: true });
    }

  } catch (err) {
    console.error('Command error:', err);
    interaction.editReply('❌ Something went wrong: ' + err.message).catch(() => {});
  }
});

client.login(BOT_TOKEN);
