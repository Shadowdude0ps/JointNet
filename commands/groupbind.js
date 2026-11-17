const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { isAdmin, deny } = require('../utils/permissions');
const roblox = require('../utils/roblox');
const binds = require('../utils/groupbinds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('groupbind')
    .setDescription('Give a Discord role to cleared members who are in a Roblox group')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(s => s.setName('add').setDescription('Bind a Roblox group (and minimum rank) to a Discord role')
      .addIntegerOption(o => o.setName('group_id').setDescription('Roblox group ID (the number in the group URL)').setRequired(true).setMinValue(1))
      .addRoleOption(o => o.setName('role').setDescription('Discord role to give').setRequired(true))
      .addIntegerOption(o => o.setName('min_rank').setDescription('Lowest group rank that gets the role, 1-255 (default 1 = any member)').setMinValue(0).setMaxValue(255)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a bind')
      .addIntegerOption(o => o.setName('group_id').setDescription('Roblox group ID').setRequired(true).setMinValue(1))
      .addRoleOption(o => o.setName('role').setDescription('Discord role').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('Show all group binds')),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) return deny(interaction, 'Only server administrators can manage group binds.');
    const sub = interaction.options.getSubcommand();
    const ephemeral = { flags: MessageFlags.Ephemeral };

    if (sub === 'add') {
      await interaction.deferReply(ephemeral);
      const groupId = interaction.options.getInteger('group_id');
      const role = interaction.options.getRole('role');
      const minRank = interaction.options.getInteger('min_rank') ?? 1;

      const group = await roblox.getGroupById(groupId);
      if (!group) return interaction.editReply(`❌ I couldn't find a Roblox group with ID **${groupId}** (or Roblox didn't respond).`);

      binds.addBind({ groupId, groupName: group.name, minRank, roleId: role.id });
      return interaction.editReply({
        content: `✅ Cleared members in **${group.name}** with rank **${minRank}+** will get ${role}.`,
        allowedMentions: { parse: [] },
      });
    }

    if (sub === 'remove') {
      const removed = binds.removeBind(interaction.options.getInteger('group_id'), interaction.options.getRole('role').id);
      return interaction.reply({ content: removed ? `✅ Removed ${removed} bind(s).` : 'No bind found for that group and role.', ...ephemeral });
    }

    // list
    const list = binds.getBinds();
    return interaction.reply({
      ...ephemeral,
      allowedMentions: { parse: [] },
      embeds: [{
        color: 0x5865F2,
        title: 'Group binds',
        description: list.length
          ? list.map(b => `• [${b.groupName}](https://www.roblox.com/groups/${b.groupId}) rank **${b.minRank}+** → <@&${b.roleId}>`).join('\n').slice(0, 4000)
          : 'No binds yet. Add one with `/groupbind add`.',
      }],
    });
  },
};
