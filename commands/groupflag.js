const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { isAdmin, isStaff, deny } = require('../utils/permissions');
const roblox = require('../utils/roblox');
const flags = require('../utils/groupflags');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('groupflag')
    .setDescription('Flag Roblox groups so requests from their members are highlighted')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(s => s.setName('add').setDescription('Flag a Roblox group')
      .addIntegerOption(o => o.setName('group_id').setDescription('Roblox group ID (the number in the group URL)').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('reason').setDescription('Why it is flagged').setRequired(true).setMaxLength(200)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a flag')
      .addIntegerOption(o => o.setName('group_id').setDescription('Roblox group ID').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('list').setDescription('Show all flagged groups')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const ephemeral = { flags: MessageFlags.Ephemeral };

    if (sub === 'list') {
      if (!isStaff(interaction.member)) return deny(interaction);
      const entries = Object.entries(flags.getFlags());
      return interaction.reply({
        ...ephemeral,
        embeds: [{
          color: 0xED4245,
          title: `🚩 Flagged groups (${entries.length})`,
          description: entries.length
            ? entries.map(([id, f]) => `• [**${f.name}**](https://www.roblox.com/groups/${id}) (\`${id}\`): ${f.reason}`).join('\n').slice(0, 4000)
            : 'No groups flagged yet. Add one with `/groupflag add`.',
        }],
      });
    }

    if (!isAdmin(interaction.member)) return deny(interaction, 'Only server administrators can add or remove group flags.');

    if (sub === 'add') {
      await interaction.deferReply(ephemeral);
      const groupId = interaction.options.getInteger('group_id');
      const reason = interaction.options.getString('reason').trim();

      const group = await roblox.getGroupById(groupId);
      if (!group) return interaction.editReply(`❌ I couldn't find a Roblox group with ID **${groupId}** (or Roblox didn't respond).`);

      const existed = Boolean(flags.getFlag(groupId));
      flags.addFlag(groupId, { name: group.name, reason, addedBy: interaction.user.id });
      return interaction.editReply(`🚩 ${existed ? 'Updated the flag on' : 'Flagged'} **${group.name}** (\`${groupId}\`): ${reason}`);
    }

    // remove
    const groupId = interaction.options.getInteger('group_id');
    const name = flags.getFlag(groupId)?.name;
    return interaction.reply({
      ...ephemeral,
      content: flags.removeFlag(groupId) ? `✅ Removed the flag on **${name}** (\`${groupId}\`).` : 'That group isn\'t flagged.',
    });
  },
};
