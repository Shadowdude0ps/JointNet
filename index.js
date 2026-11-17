require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes, MessageFlags } = require('discord.js');

// Start the web server first so Render sees an open port straight away.
require('./keep_alive').keepAlive();

const db = require('./utils/db');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// ── Load every command in /commands ─────────────────────────────────────────
const commandJson = [];
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(__dirname, 'commands', file));
  if (!cmd?.data?.name) {
    console.warn(`⚠️ commands/${file} has no "data" export, skipped.`);
    continue;
  }
  client.commands.set(cmd.data.name, cmd);
  commandJson.push(cmd.data.toJSON());
}

// ── Ready ───────────────────────────────────────────────────────────────────
client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  try {
    // PUT replaces the whole list, so any old commands from the previous bot disappear.
    await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: commandJson });
    // Also clear any leftover global commands from the old version.
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    console.log(`✅ Registered ${commandJson.length} slash commands: ${commandJson.map(c => '/' + c.name).join(', ')}`);
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }

  try { require('./utils/presence').start(client); } catch (err) { console.error('❌ Presence error:', err); }
});

// ── Interactions ────────────────────────────────────────────────────────────
async function safeReply(interaction, content) {
  const msg = { content, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
    else await interaction.reply(msg);
  } catch (err) {
    console.error('❌ Failed to send error reply:', err.message);
  }
}

client.on('interactionCreate', async interaction => {
  // Buttons and modal submissions: customId is "<command>:<action>[:<extra>]"
  if (interaction.isButton() || interaction.isModalSubmit()) {
    const owner = client.commands.get(interaction.customId.split(':')[0]);
    if (!owner?.component) return console.warn(`⚠️ No handler for: ${interaction.customId}`);
    try {
      await owner.component(interaction, client);
    } catch (err) {
      console.error(`❌ Component error (${interaction.customId}):`, err);
      await safeReply(interaction, '❌ Something went wrong processing that.');
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction, client);
  } catch (err) {
    console.error(`❌ Command error (/${interaction.commandName}):`, err);
    await safeReply(interaction, '❌ An error occurred running that command.');
  }
});

process.on('unhandledRejection', err => console.error('❌ Unhandled rejection:', err));
process.on('uncaughtException',  err => console.error('❌ Uncaught exception:', err));

// ── Start ───────────────────────────────────────────────────────────────────
(async () => {
  for (const name of ['BOT_TOKEN', 'GUILD_ID']) {
    if (!process.env[name]) { console.error(`❌ ${name} is not set.`); process.exit(1); }
  }
  try {
    await db.init();
    console.log('✅ Database ready.');
  } catch (err) {
    console.error('❌ Database failed to start:', err.message);
    console.error('Check MONGODB_URI, your Atlas user/password, and that Network Access allows 0.0.0.0/0.');
    process.exit(1);
  }
  try {
    await client.login(process.env.BOT_TOKEN);
  } catch (err) {
    console.error('❌ Discord login failed:', err);
    process.exit(1);
  }
})();
