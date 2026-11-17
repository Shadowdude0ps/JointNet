const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { isStaff, deny } = require('../utils/permissions');
const { getChannel, channelEnvName } = require('../utils/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule an upcoming event')
    .setContexts(InteractionContextType.Guild)
    .addStringOption(o => o.setName('event').setDescription('Event name, e.g. FTX').setRequired(true).setMaxLength(100))
    .addStringOption(o => o.setName('time').setDescription('When it is, e.g. Saturday 8pm GMT').setRequired(true).setMaxLength(100))
    .addUserOption(o => o.setName('host').setDescription('Who is hosting (defaults to you)').setRequired(false))
    .addStringOption(o => o.setName('location').setDescription('Where it takes place').setRequired(false).setMaxLength(200))
    .addStringOption(o => o.setName('notes').setDescription('Extra details').setRequired(false).setMaxLength(1000))
    .addRoleOption(o => o.setName('ping').setDescription('Role to ping').setRequired(false)),

  async execute(interaction) {
    if (!isStaff(interaction.member)) return deny(interaction);

    const channel = await getChannel(interaction.client, 'schedule');
    if (!channel) {
      return interaction.reply({
        content: `❌ The schedule channel isn't set up. Set \`${channelEnvName('schedule')}\` in the bot's environment.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const name     = interaction.options.getString('event');
    const time     = interaction.options.getString('time');
    const host     = interaction.options.getUser('host') ?? interaction.user;
    const location = interaction.options.getString('location');
    const notes    = interaction.options.getString('notes');
    const ping     = interaction.options.getRole('ping');

    const fields = [
      { name: 'Event', value: name,      inline: true },
      { name: 'Host',  value: `${host}`, inline: true },
      { name: 'When',  value: time,      inline: true },
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
    return interaction.editReply(`✅ **${name}** scheduled in ${channel}.`);
  },
};
