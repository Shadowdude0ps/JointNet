const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { canRunEvents, deny } = require('../utils/permissions');
const { getChannel, channelEnvName } = require('../utils/config');
const { zonedToUnix, parseDate, parseTime } = require('../utils/time');

// The timezone the host types the time in. Everyone else sees it converted to their own.
// Add or rename zones here (max 25). `value` must be an IANA timezone name.
const ZONES = [
  { name: 'Ireland / UK (GMT/IST)',   value: 'Europe/Dublin' },
  { name: 'UTC',                      value: 'UTC' },
  { name: 'Central Europe (CET)',     value: 'Europe/Paris' },
  { name: 'US Eastern (ET)',          value: 'America/New_York' },
  { name: 'US Central (CT)',          value: 'America/Chicago' },
  { name: 'US Pacific (PT)',          value: 'America/Los_Angeles' },
  { name: 'Australia East (Sydney)',  value: 'Australia/Sydney' },
];
const DEFAULT_ZONE = 'Europe/Dublin';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule an upcoming event')
    .setContexts(InteractionContextType.Guild)
    .addStringOption(o => o.setName('event').setDescription('Event name, e.g. FTX').setRequired(true).setMaxLength(100))
    .addStringOption(o => o.setName('date').setDescription('Date, day first: 21/11/2026').setRequired(true).setMaxLength(10))
    .addStringOption(o => o.setName('time').setDescription('Time: 20:00 or 8pm').setRequired(true).setMaxLength(8))
    .addStringOption(o =>
      o.setName('timezone').setDescription('Timezone you are typing the time in (default: Ireland / UK)').setRequired(false)
        .addChoices(...ZONES))
    .addUserOption(o => o.setName('host').setDescription('Who is hosting (defaults to you)').setRequired(false))
    .addStringOption(o => o.setName('location').setDescription('Where it takes place').setRequired(false).setMaxLength(200))
    .addStringOption(o => o.setName('notes').setDescription('Extra details').setRequired(false).setMaxLength(1000))
    .addRoleOption(o => o.setName('ping').setDescription('Role to ping').setRequired(false)),

  async execute(interaction) {
    if (!canRunEvents(interaction.member)) return deny(interaction);

    const channel = await getChannel(interaction.client, 'schedule');
    if (!channel) {
      return interaction.reply({
        content: `❌ The schedule channel isn't set up. Set \`${channelEnvName('schedule')}\` in the bot's environment.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const name     = interaction.options.getString('event');
    const dateStr  = interaction.options.getString('date');
    const timeStr  = interaction.options.getString('time');
    const zone     = interaction.options.getString('timezone') ?? DEFAULT_ZONE;
    const host     = interaction.options.getUser('host') ?? interaction.user;
    const location = interaction.options.getString('location');
    const notes    = interaction.options.getString('notes');
    const ping     = interaction.options.getRole('ping');

    const date = parseDate(dateStr);
    if (!date) {
      return interaction.reply({
        content: '❌ I couldn\'t read that date. Use day first, like `21/11/2026`.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const time = parseTime(timeStr);
    if (!time) {
      return interaction.reply({
        content: '❌ I couldn\'t read that time. Use `20:00` or `8pm`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const unix = zonedToUnix(date.year, date.month, date.day, time.hour, time.minute, zone);
    if (unix * 1000 < Date.now()) {
      return interaction.reply({
        content: '❌ That time is in the past. Check the date and timezone.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // <t:UNIX:F> shows in each viewer's own timezone; <t:UNIX:R> is the live countdown.
    const fields = [
      { name: 'Event', value: name,      inline: true },
      { name: 'Host',  value: `${host}`, inline: true },
      { name: 'When',  value: `<t:${unix}:F>\n<t:${unix}:R>`, inline: false },
    ];
    if (location) fields.push({ name: 'Location', value: location, inline: false });
    if (notes)    fields.push({ name: 'Details',  value: notes,    inline: false });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const msg = await channel.send({
        content: ping ? `${ping}` : undefined,
        embeds: [{
          color: 0x3D7AE0,
          title: 'Scheduled Event',
          description: `**${name}** has been scheduled.`,
          fields,
          footer: { text: `Scheduled by ${interaction.member.displayName}` },
          timestamp: new Date().toISOString(),
        }],
        allowedMentions: ping ? { roles: [ping.id] } : { parse: [] },
      });
      await msg.react('✅').catch(() => {});
      await msg.react('❌').catch(() => {});
    } catch (err) {
      console.error(err);
      return interaction.editReply('❌ I couldn\'t post in the schedule channel (check my permissions there).');
    }
    return interaction.editReply(`✅ **${name}** scheduled in ${channel} for <t:${unix}:F>.`);
  },
};
