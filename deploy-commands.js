const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const BOT_TOKEN  = process.env.BOT_TOKEN  || '';
const CLIENT_ID  = process.env.CLIENT_ID  || '';
const GUILD_ID   = '1477827789964054721';

if (!BOT_TOKEN)  { console.error('BOT_TOKEN not set');  process.exit(1); }
if (!CLIENT_ID)  { console.error('CLIENT_ID not set');  process.exit(1); }

const commands = [
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show vUPS live operations status'),

  new SlashCommandBuilder()
    .setName('trips')
    .setDescription('Show all open trips available to bid on'),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top freight haulers leaderboard'),

  new SlashCommandBuilder()
    .setName('mypireps')
    .setDescription('Show PIREPs for a pilot')
    .addStringOption(o => o
      .setName('name')
      .setDescription('Your display name on the vUPS portal')
      .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('pirep')
    .setDescription('File a PIREP directly from Discord')
    .addStringOption(o => o.setName('name').setDescription('Your display name').setRequired(true))
    .addStringOption(o => o.setName('flight').setDescription('Flight number e.g. 5X301').setRequired(true))
    .addStringOption(o => o.setName('origin').setDescription('Departure ICAO e.g. KSDF').setRequired(true))
    .addStringOption(o => o.setName('destination').setDescription('Arrival ICAO e.g. EDDK').setRequired(true))
    .addStringOption(o => o
      .setName('aircraft')
      .setDescription('Aircraft type')
      .setRequired(true)
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
      )
    )
    .addNumberOption(o => o.setName('blocktime').setDescription('Block time in hours e.g. 9.5').setRequired(true))
    .addIntegerOption(o => o.setName('payload').setDescription('Payload in lbs').setRequired(true))
    .addIntegerOption(o => o.setName('landingrate').setDescription('Landing rate in fpm (optional)').setRequired(false)),

].map(c => c.toJSON());

const rest = new REST().setToken(BOT_TOKEN);

(async () => {
  console.log('Registering slash commands to guild...');
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log('Commands registered instantly to your server.');
})();
