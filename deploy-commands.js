const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const CLIENT_ID = process.env.CLIENT_ID || '';
const GUILD_ID  = '1477827789964054721';

if (!BOT_TOKEN) { console.error('BOT_TOKEN not set'); process.exit(1); }
if (!CLIENT_ID) { console.error('CLIENT_ID not set'); process.exit(1); }

const commands = [
  // ── vUPS ──────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName('status').setDescription('vUPS live operations status'),
  new SlashCommandBuilder().setName('trips').setDescription('Show open trips to bid on'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Top freight haulers'),
  new SlashCommandBuilder().setName('roster').setDescription('Show the full crew roster'),
  new SlashCommandBuilder().setName('mypireps').setDescription('Show PIREPs for a pilot')
    .addStringOption(o => o.setName('name').setDescription('Display name on vUPS portal').setRequired(true)),
  new SlashCommandBuilder().setName('pirep').setDescription('File a PIREP from Discord')
    .addStringOption(o => o.setName('name').setDescription('Your display name').setRequired(true))
    .addStringOption(o => o.setName('flight').setDescription('Flight number e.g. 5X301').setRequired(true))
    .addStringOption(o => o.setName('origin').setDescription('Departure ICAO').setRequired(true))
    .addStringOption(o => o.setName('destination').setDescription('Arrival ICAO').setRequired(true))
    .addStringOption(o => o.setName('aircraft').setDescription('Aircraft type').setRequired(true)
      .addChoices(
        { name: 'Boeing 747-8F',            value: 'Boeing 747-8F' },
        { name: 'Boeing 747-400F',          value: 'Boeing 747-400F' },
        { name: 'Boeing 767-300F',          value: 'Boeing 767-300F' },
        { name: 'Boeing 757-200F',          value: 'Boeing 757-200F' },
        { name: 'Airbus A300-600F',         value: 'Airbus A300-600F' },
        { name: 'McDonnell Douglas MD-11F', value: 'McDonnell Douglas MD-11F' },
        { name: 'Boeing 727-200F',          value: 'Boeing 727-200F' },
        { name: 'Boeing 727-100F',          value: 'Boeing 727-100F' },
        { name: 'Douglas DC-8F',            value: 'Douglas DC-8F' },
      ))
    .addNumberOption(o => o.setName('blocktime').setDescription('Block time in hours e.g. 9.5').setRequired(true))
    .addIntegerOption(o => o.setName('payload').setDescription('Payload in lbs').setRequired(true))
    .addIntegerOption(o => o.setName('landingrate').setDescription('Landing rate fpm (optional)').setRequired(false)),

  // ── Aviation ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName('metar').setDescription('Get live METAR for any airport')
    .addStringOption(o => o.setName('icao').setDescription('Airport ICAO code e.g. KSDF').setRequired(true)),

  // ── Info ───────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName('whois').setDescription('View info about a member')
    .addUserOption(o => o.setName('user').setDescription('Member to look up').setRequired(false)),
  new SlashCommandBuilder().setName('serverinfo').setDescription('View server information'),
  new SlashCommandBuilder().setName('membercount').setDescription('View server member count'),

  // ── Moderation (staff only) ────────────────────────────────────────────────
  new SlashCommandBuilder().setName('warn').setDescription('Warn a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption(o => o.setName('user').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
  new SlashCommandBuilder().setName('warnings').setDescription('View warnings for a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('clearwarnings').setDescription('Clear all warnings for a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('user').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
  new SlashCommandBuilder().setName('unban').setDescription('Unban a user by ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(o => o.setName('userid').setDescription('User ID to unban').setRequired(true)),
  new SlashCommandBuilder().setName('purge').setDescription('Delete multiple messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to delete (max 100)').setRequired(true).setMinValue(1).setMaxValue(100)),

  // ── Announcements (staff only) ────────────────────────────────────────────
  new SlashCommandBuilder().setName('announce').setDescription('Post a vUPS announcement embed')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('title').setDescription('Announcement title').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Announcement body').setRequired(true))
    .addStringOption(o => o.setName('ping').setDescription('Who to ping').setRequired(false)
      .addChoices(
        { name: 'No ping', value: 'none' },
        { name: '@here', value: 'here' },
        { name: '@everyone', value: 'everyone' },
      ))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post in (default: current)').setRequired(false)),

  new SlashCommandBuilder().setName('hiring').setDescription('Post a vUPS is hiring announcement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('role').setDescription('Role you are hiring for e.g. Event Coordinator').setRequired(true))
    .addStringOption(o => o.setName('details').setDescription('Extra details about the role').setRequired(false))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post in (default: current)').setRequired(false)),

].map(c => c.toJSON());

const rest = new REST().setToken(BOT_TOKEN);

(async () => {
  console.log('Registering ' + commands.length + ' commands to guild...');
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log('✅ All commands registered instantly.');
})();
