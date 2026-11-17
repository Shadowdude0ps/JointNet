const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { canSetThreat, deny } = require('../utils/permissions');
const { getChannel, channelEnvName } = require('../utils/config');
const { choices, buildPost, setCurrent } = require('../utils/threat');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('threatlevel')
    .setDescription('Post the National Threat Level')
    .setContexts(InteractionContextType.Guild)
    .addStringOption(o =>
      o.setName('level').setDescription('The new threat level').setRequired(true).addChoices(...choices()))
    .addRoleOption(o => o.setName('ping').setDescription('Role to ping').setRequired(false)),

  async execute(interaction) {
    if (!canSetThreat(interaction.member)) return deny(interaction, 'You aren\'t allowed to set the National Threat Level.');

    const channel = await getChannel(interaction.client, 'level');
    if (!channel) {
      return interaction.reply({
        content: `❌ The level channel isn't set up. Set \`${channelEnvName('level')}\` in the bot's environment.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const ping = interaction.options.getRole('ping');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { embeds, files, level } = buildPost(interaction.options.getString('level'));
    try {
      await channel.send({
        content: ping ? `${ping}` : undefined,
        embeds,
        files,
        allowedMentions: ping ? { roles: [ping.id] } : { parse: [] },
      });
    } catch (err) {
      console.error(err);
      return interaction.editReply('❌ I couldn\'t post in the level channel (check my permissions there).');
    }

    setCurrent(level.key);
    const note = files.length ? '' : `\n⚠️ No image found (\`assets/ntl_${level.key}.jpg\`), so it was posted without one.`;
    return interaction.editReply(`✅ National Threat Level set to **${level.label}** and posted in ${channel}.${note}`);
  },
};
