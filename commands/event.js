const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { isStaff, deny } = require('../utils/permissions');
const { getChannel, channelEnvName } = require('../utils/config');

// Add, remove or rename event types here. `channel` is a key from utils/config.js.
const TYPES = {
  ceremonial:      { label: 'Ceremonial',        channel: 'events',          color: 0xB8860B },
  deployments:     { label: 'Deployments',       channel: 'events',          color: 0xEC7818 },
  trainings:       { label: 'Trainings',         channel: 'events',          color: 0x3D7AE0 },
  civildeployment: { label: 'Civil Deployments', channel: 'civilDeployment', color: 0x2ECC71 },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Announce an event that is starting now')
    .setContexts(InteractionContextType.Guild)
    .addStringOption(o =>
      o.setName('type').setDescription('Type of event').setRequired(true)
        .addChoices(...Object.entries(TYPES).map(([value, t]) => ({ name: t.label, value }))))
    .addStringOption(o => o.setName('name').setDescription('Event name, e.g. FTX').setRequired(true).setMaxLength(100))
    .addUserOption(o => o.setName('host').setDescription('Who is hosting (defaults to you)').setRequired(false))
    .addStringOption(o => o.setName('location').setDescription('Where / link / game').setRequired(false).setMaxLength(200))
    .addStringOption(o => o.setName('notes').setDescription('Extra details').setRequired(false).setMaxLength(1000))
    .addRoleOption(o => o.setName('ping').setDescription('Role to ping').setRequired(false)),

  async execute(interaction) {
    if (!isStaff(interaction.member)) return deny(interaction);

    const type = TYPES[interaction.options.getString('type')];
    const channel = await getChannel(interaction.client, type.channel);
    if (!channel) {
      return interaction.reply({
        content: `❌ The channel for **${type.label}** isn't set up. Set \`${channelEnvName(type.channel)}\` in the bot's environment.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const name     = interaction.options.getString('name');
    const host     = interaction.options.getUser('host') ?? interaction.user;
    const location = interaction.options.getString('location');
    const notes    = interaction.options.getString('notes');
    const ping     = interaction.options.getRole('ping');

    const fields = [
      { name: 'Type', value: type.label, inline: true },
      { name: 'Host', value: `${host}`,  inline: true },
    ];
    if (location) fields.push({ name: 'Location', value: location, inline: true });
    if (notes)    fields.push({ name: 'Details',  value: notes,    inline: false });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await channel.send({
        content: ping ? `${ping}` : undefined,
        embeds: [{
          color: type.color,
          title: type.label,
          description: `**${name}** is starting now.`,
          fields,
          footer: { text: `Announced by ${interaction.member.displayName}` },
          timestamp: new Date().toISOString(),
        }],
        allowedMentions: ping ? { roles: [ping.id] } : { parse: [] },
      });
    } catch (err) {
      console.error(err);
      return interaction.editReply(`❌ I couldn't post in ${channel} (check my permissions there).`);
    }
    return interaction.editReply(`✅ **${name}** announced in ${channel}.`);
  },
};
