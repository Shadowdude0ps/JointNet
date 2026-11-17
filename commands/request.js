/**
 * /request: only members WITHOUT the Cleared role can submit a request.
 *
 *  1. A form opens asking for Roblox username, profile link, rank (Garda / Defence Forces / NAS),
 *     roles requesting and a vouch.
 *     (Their Discord username/ID is taken automatically from their account.)
 *  2. The bot looks the Roblox account up, sets the member's nickname to
 *     "<RobloxUsername> | <RobloxUserId>", and posts the full result in the requests
 *     channel: Discord + Roblox details, avatar, and ALL of the user's Roblox groups.
 *  3. Staff press Accept / Deny (Deny asks for a reason). The requester gets a DM.
 */
const {
  SlashCommandBuilder,
  InteractionContextType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const db = require('../utils/db');
const roblox = require('../utils/roblox');
const { getChannel, channelEnvName } = require('../utils/config');
const { isStaff, deny } = require('../utils/permissions');
const { matchingBinds } = require('../utils/groupbinds');
const { flaggedIn, getFlag } = require('../utils/groupflags');

const COLOR_PENDING = 0x3D7AE0;
const COLOR_ACCEPTED = 0x2ECC71;
const COLOR_DENIED = 0xED4245;
const COLOR_GROUPS = 0x5865F2;
const COLOR_FLAGGED = 0xE67E22; // pending request from a member of a flagged group

const STATUS_FIELD = 'Status';
const COOLDOWN_MS = 30_000;               // between submissions per person
const PENDING_BLOCK_MS = 24 * 60 * 60_000; // one open request per person (expires after 24h)
const GROUP_CHUNK_CHARS = 3800;            // each groups embed stays under Discord's 4096 limit
const MAX_GROUP_MESSAGES = 6;
const ROBLOX_NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const PROFILE_RE = /roblox\.com\/(?:[a-z-]+\/)?users\/(\d+)/i;

const ALREADY_CLEARED_MSG = '✅ You already have the **Cleared** role, so you can\'t submit a request.';

/** The Cleared role: CLEARED_ROLE_ID, or a role named "Cleared" if that is blank. */
function clearedRoleId(guild) {
  return process.env.CLEARED_ROLE_ID
    || guild?.roles.cache.find(r => r.name.toLowerCase() === 'cleared')?.id
    || null;
}

function isCleared(member) {
  const id = clearedRoleId(member?.guild);
  return Boolean(id && member.roles.cache.has(id));
}

const cooldowns = new Map();

// ── tiny helpers ─────────────────────────────────────────────────────────────
const clip = (s, n) => {
  const t = String(s ?? '').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const orDash = s => (String(s ?? '').trim() ? String(s) : '—');
const unix = ms => Math.floor(ms / 1000);
const escapeMd = s => String(s).replace(/[\\[\]*_`~|>]/g, '\\$&');
const fmtNum = n => (typeof n === 'number' ? n.toLocaleString('en-GB') : '?');

const store = () => db.get('requests', { items: {} });

/** "Username | 12345678", always 32 characters or fewer (Discord's nickname limit). */
function makeNickname(name, id) {
  const suffix = ` | ${id}`;
  return name.slice(0, 32 - suffix.length) + suffix;
}

function pruneStore() {
  const items = store().items;
  const ids = Object.keys(items);
  if (ids.length <= 1000) return;
  ids.sort((a, b) => (items[a].at ?? 0) - (items[b].at ?? 0))
    .slice(0, ids.length - 1000)
    .forEach(id => delete items[id]);
}

// ── message builders (pure, so they are easy to test) ────────────────────────

/** The main embed staff see. `d` holds everything gathered about the request. */
function buildMainEmbed(d) {
  const { discordUser, member, rbx, rank, rolesRequested, vouch, profileLink, nicknameNote, notes } = d;
  const profile = `https://www.roblox.com/users/${rbx.Id}/profile`;
  const created = rbx.created ? new Date(rbx.created).getTime() : null;
  const age = roblox.accountAgeDays(rbx.created);
  const flagged = flaggedIn(d.groups);

  const fields = [
    {
      name: 'Discord',
      value: `${discordUser}\n**Username:** ${discordUser.username}\n**ID:** \`${discordUser.id}\``,
      inline: true,
    },
    {
      name: 'Roblox',
      value: `[${escapeMd(rbx.Username)}](${profile})\n**Display:** ${escapeMd(rbx.DisplayName || rbx.Username)}\n**ID:** \`${rbx.Id}\``,
      inline: true,
    },
    {
      name: 'Banned',
      value: rbx.isBanned ? '**Yes**' : 'No',
      inline: true,
    },
    {
      name: 'Roblox account created',
      value: created ? `<t:${unix(created)}:D>\n${age} day${age === 1 ? '' : 's'} old` : 'Unknown',
      inline: true,
    },
    {
      name: 'Discord account / joined server',
      value:
        `Created <t:${unix(discordUser.createdTimestamp)}:D>\n` +
        (member?.joinedTimestamp ? `Joined <t:${unix(member.joinedTimestamp)}:D>` : 'Join date unknown'),
      inline: true,
    },
    {
      name: 'Social',
      value: `**Friends:** ${fmtNum(d.friendCount)}\n**Followers:** ${fmtNum(d.followerCount)}\n**Following:** ${fmtNum(d.followingCount)}`,
      inline: true,
    },
    {
      name: 'Groups',
      value: d.groups.length
        ? `${d.groups.length} (full list below)${flagged.length ? `\n🔴 **${flagged.length} flagged**` : ''}`
        : 'None',
      inline: true,
    },
    {
      name: 'Previous usernames',
      value: d.prevNames.length ? clip(d.prevNames.map(n => escapeMd(n.name)).join(', '), 300) : 'None',
      inline: true,
    },
    {
      name: 'Roblox bio',
      value: orDash(clip(rbx.description, 400)),
      inline: false,
    },
    { name: 'Link to Profile', value: orDash(clip(profileLink, 300)), inline: false },
    { name: 'Rank within Garda / Defence Forces / NAS', value: orDash(clip(rank, 300)), inline: false },
    { name: 'Roles Requesting', value: orDash(clip(rolesRequested, 600)), inline: false },
    { name: 'Vouch', value: orDash(clip(vouch, 600)), inline: false },
  ];
  if (flagged.length) {
    fields.push({
      name: '🔴 Flagged groups',
      value: clip(flagged.map(g =>
        `• [**${escapeMd(g.group.name)}**](https://www.roblox.com/groups/${g.group.id}) (${escapeMd(g.role?.name ?? '?')}): ${escapeMd(g.flag.reason)}`).join('\n'), 1000),
      inline: false,
    });
  }
  fields.push({ name: 'Nickname', value: nicknameNote, inline: false });
  if (notes.length) fields.push({ name: 'Notes', value: clip(notes.join('\n'), 1000), inline: false });
  fields.push({ name: STATUS_FIELD, value: 'Pending review', inline: false });

  const embed = new EmbedBuilder()
    .setColor(flagged.length ? COLOR_FLAGGED : COLOR_PENDING)
    .setTitle(`${flagged.length ? '🔴 ' : ''}New Request: ${rbx.Username}`)
    .addFields(fields)
    .setFooter({ text: 'Roblox username is self-reported and not verified' })
    .setTimestamp();
  if (d.avatarUrl) embed.setThumbnail(d.avatarUrl);
  return embed;
}

/** One or more embeds listing every group, highest rank first. */
function buildGroupEmbeds(d) {
  const sorted = [...d.groups].sort((a, b) =>
    Number(Boolean(getFlag(b.group.id))) - Number(Boolean(getFlag(a.group.id))) ||
    (b.role?.rank ?? 0) - (a.role?.rank ?? 0) || a.group.name.localeCompare(b.group.name));

  const lines = sorted.map(g =>
    `${getFlag(g.group.id) ? '🔴' : '•'} [${escapeMd(g.group.name)}](https://www.roblox.com/groups/${g.group.id}) — **${escapeMd(g.role?.name ?? '?')}** (rank ${g.role?.rank ?? '?'})`);

  const chunks = [];
  let current = '';
  for (const line of lines) {
    if (current && current.length + line.length + 1 > GROUP_CHUNK_CHARS) {
      chunks.push(current);
      current = '';
    }
    current += (current ? '\n' : '') + line;
  }
  if (current) chunks.push(current);

  const shown = chunks.slice(0, MAX_GROUP_MESSAGES);
  const embeds = shown.map((text, i) => new EmbedBuilder()
    .setColor(COLOR_GROUPS)
    .setTitle(`${d.rbx.Username}'s Roblox Groups (${d.groups.length})${chunks.length > 1 ? ` — part ${i + 1}/${chunks.length}` : ''}`)
    .setDescription(text));

  if (chunks.length > shown.length) {
    embeds[embeds.length - 1].setFooter({ text: 'More groups exist than could be shown. See the Roblox profile for the rest.' });
  }
  return embeds;
}

const reviewButtons = () => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('request:accept').setLabel('Accept').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('request:deny').setLabel('Deny').setStyle(ButtonStyle.Danger),
);

// ── submit flow ──────────────────────────────────────────────────────────────

function openModal(interaction) {
  const input = (id, label, style, { required = true, max, placeholder } = {}) => {
    const t = new TextInputBuilder()
      .setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
    if (placeholder) t.setPlaceholder(placeholder);
    return new ActionRowBuilder().addComponents(t);
  };

  const modal = new ModalBuilder()
    .setCustomId('request:submit')
    .setTitle('JointNet Request')
    .addComponents(
      input('roblox',  'Roblox Username',   TextInputStyle.Short,     { max: 20,  placeholder: 'e.g. Builderman' }),
      input('link',    'Link to Profile',   TextInputStyle.Short,     { max: 200, placeholder: 'https://www.roblox.com/users/123456789/profile' }),
            input('rank',    'Rank within Garda or Defence Forces or NAS', TextInputStyle.Short, { max: 100, placeholder: 'Your current rank' }),
      input('roles',   'Roles Requesting',  TextInputStyle.Paragraph, { max: 300, placeholder: 'Which roles are you requesting?' }),
      input('vouch',   'Vouch',             TextInputStyle.Paragraph, { max: 500, placeholder: 'Who is vouching for you?' }),
    );
  return interaction.showModal(modal);
}

async function handleSubmit(interaction) {
  const reply = content => interaction.editReply({ content });

  // Re-check here too: they might have been cleared while the form was open.
  if (isCleared(interaction.member)) {
    return interaction.reply({ content: ALREADY_CLEARED_MSG, flags: MessageFlags.Ephemeral });
  }

  const rawName        = interaction.fields.getTextInputValue('roblox').trim();
  const profileLink    = interaction.fields.getTextInputValue('link').trim();
  const rank           = interaction.fields.getTextInputValue('rank').trim();
  const rolesRequested = interaction.fields.getTextInputValue('roles').trim();
  const vouch          = interaction.fields.getTextInputValue('vouch').trim();

  if (!ROBLOX_NAME_RE.test(rawName)) {
    return interaction.reply({
      content: '❌ That doesn\'t look like a Roblox username (3–20 letters, numbers or underscores). Run `/request` and try again.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const last = cooldowns.get(interaction.user.id) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) {
    return interaction.reply({ content: '⏳ Slow down a moment and try again.', flags: MessageFlags.Ephemeral });
  }

  const items = store().items;
  const open = Object.values(items).find(r =>
    r.userId === interaction.user.id && r.status === 'pending' && Date.now() - r.at < PENDING_BLOCK_MS);
  if (open) {
    return interaction.reply({
      content: '⏳ You already have a request waiting for review. Please wait for staff to answer it.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  cooldowns.set(interaction.user.id, Date.now());

  const channel = await getChannel(interaction.client, 'requests');
  if (!channel) {
    console.error(`[request] ${channelEnvName('requests')} is not set or the channel is not accessible.`);
    return reply('❌ Requests aren\'t set up yet. Please tell a staff member.');
  }

  // Roblox lookup
  const found = await roblox.getUserByName(rawName);
  if (!found) {
    cooldowns.delete(interaction.user.id);
    return reply(`❌ I couldn't find a Roblox user called **${rawName}** (or Roblox didn't respond). Check the spelling and run \`/request\` again.`);
  }

  const [rbx, prevNames, friendCount, followerCount, followingCount, groups, avatarUrl] = await Promise.all([
    roblox.getUserById(found.Id),
    roblox.getUsernameHistory(found.Id),
    roblox.getFriendCount(found.Id),
    roblox.getFollowerCount(found.Id),
    roblox.getFollowingCount(found.Id),
    roblox.getUserGroups(found.Id),
    roblox.getAvatarUrl(found.Id),
  ]);
  if (!rbx) {
    cooldowns.delete(interaction.user.id);
    return reply('❌ Roblox didn\'t return that profile. Please try again in a minute.');
  }

  // Notes for staff
  const notes = [];
  const age = roblox.accountAgeDays(rbx.created);
  if (typeof age === 'number' && age < 30) notes.push(`🆕 New Roblox account (${age} day${age === 1 ? '' : 's'} old)`);
  if (rbx.isBanned) notes.push('This Roblox account is banned');
  if (friendCount === 0) notes.push('No friends listed');
  if (!groups.length) notes.push('Not in any groups');
  const linkId = profileLink.match(PROFILE_RE)?.[1];
  if (!linkId) notes.push('The profile link isn\'t a recognisable Roblox profile link');
  else if (String(linkId) !== String(rbx.Id)) notes.push(`The profile link is for Roblox ID \`${linkId}\`, but the username given is ID \`${rbx.Id}\``);
  const other = Object.values(items).find(r => r.robloxId === rbx.Id && r.userId !== interaction.user.id);
  if (other) notes.push(`This Roblox account was already used in a request by <@${other.userId}>`);

  // Nickname: Roblox username + user ID
  const nickname = makeNickname(rbx.Username, rbx.Id);
  let nicknameNote;
  try {
    await interaction.member.setNickname(nickname, 'JointNet request: Roblox username');
    nicknameNote = `Set to \`${nickname}\``;
  } catch {
    nicknameNote = `Couldn't set \`${nickname}\` (the bot's role must be above theirs, and it needs Manage Nicknames)`;
  }

  const data = {
    discordUser: interaction.user, member: interaction.member,
    rbx, prevNames, friendCount, followerCount, followingCount, groups, avatarUrl,
    rank, rolesRequested, vouch, profileLink, nicknameNote, notes,
  };

  // Post to the staff channel
  const pingRoleId = process.env.REQUESTS_PING_ROLE_ID;
  const hasFlagged = flaggedIn(groups).length > 0;
  const content = [pingRoleId && `<@&${pingRoleId}>`, hasFlagged && '🔴 **Member of a flagged group**'].filter(Boolean).join(' ') || undefined;
  let sent;
  try {
    sent = await channel.send({
      content,
      embeds: [buildMainEmbed(data)],
      components: [reviewButtons()],
      allowedMentions: pingRoleId ? { roles: [pingRoleId] } : { parse: [] },
    });
    for (const embed of buildGroupEmbeds(data)) {
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    }
  } catch (err) {
    console.error('[request] could not post:', err);
    if (!sent) return reply('❌ I couldn\'t send your request to staff. Please tell a staff member.');
  }

  items[sent.id] = {
    userId: interaction.user.id,
    robloxId: rbx.Id,
    robloxName: rbx.Username,
    status: 'pending',
    at: Date.now(),
  };
  pruneStore();
  db.save('requests');

  return reply(
    `✅ Your request has been sent to staff.\n` +
    `**Roblox:** ${rbx.Username} (\`${rbx.Id}\`)\n` +
    `**Nickname:** ${nicknameNote}`,
  );
}

// ── staff review ─────────────────────────────────────────────────────────────

/**
 * Gives an accepted member the "Cleared" role, then re-checks their Roblox groups and gives
 * every group-bind role they qualify for. Returns lines describing what happened.
 */
async function grantAccessRoles(guild, record) {
  const member = await guild.members.fetch(record.userId).catch(() => null);
  if (!member) return ['The requester is no longer in the server, so no roles were given.'];

  const lines = [];
  const toGive = []; // { id, why }

  const clearedId = clearedRoleId(guild);
  if (clearedId) toGive.push({ id: clearedId, why: 'Cleared' });
  else lines.push('No **Cleared** role found. Create one named "Cleared" or set `CLEARED_ROLE_ID`.');

  // Groups are checked again now, so binds use the user's current ranks
  const groups = await roblox.getUserGroups(record.robloxId);
  const matched = matchingBinds(groups);
  for (const b of matched) toGive.push({ id: b.roleId, why: b.groupName });
  if (!matched.length) lines.push('No group binds matched their Roblox groups.');

  const given = [];
  const failed = [];
  for (const { id } of toGive) {
    const name = guild.roles.cache.get(id)?.name ?? id;
    if (member.roles.cache.has(id)) { given.push(`${name} (already had)`); continue; }
    try {
      await member.roles.add(id, 'JointNet request accepted');
      given.push(name);
    } catch {
      failed.push(name);
    }
  }
  if (given.length)  lines.unshift(`Roles: ${given.join(', ')}`);
  if (failed.length) lines.push(`Couldn't give: ${failed.join(', ')} (my role must be above them and I need Manage Roles)`);
  return lines;
}

/** Marks a request accepted/denied on the staff message and DMs the requester. */
async function finish(interaction, message, accepted, reason) {
  const record = store().items[message.id];
  if (!record || record.status !== 'pending') {
    return interaction.followUp({ content: 'This request has already been handled (or I have no record of it).', flags: MessageFlags.Ephemeral });
  }

  record.status = accepted ? 'accepted' : 'denied';
  record.reviewedBy = interaction.user.id;
  record.reviewedAt = Date.now();
  db.save('requests');

  const roleLines = accepted ? await grantAccessRoles(interaction.guild, record) : [];

  const embed = EmbedBuilder.from(message.embeds[0]).setColor(accepted ? COLOR_ACCEPTED : COLOR_DENIED);
  const fields = embed.data.fields ?? [];
  const status = {
    name: STATUS_FIELD,
    value: `${accepted ? 'Accepted' : 'Denied'} by ${interaction.user} <t:${unix(Date.now())}:R>` +
           (reason ? `\n**Reason:** ${clip(reason, 900)}` : '') +
           (roleLines.length ? `\n${roleLines.join('\n')}` : ''),
    inline: false,
  };
  const i = fields.findIndex(f => f.name === STATUS_FIELD);
  if (i >= 0) fields[i] = status; else fields.push(status);
  embed.setFields(fields);
  await message.edit({ embeds: [embed], components: [], allowedMentions: { parse: [] } });

  // Tell the requester
  let dmed = true;
  try {
    const user = await interaction.client.users.fetch(record.userId);
    await user.send({
      embeds: [new EmbedBuilder()
        .setColor(accepted ? COLOR_ACCEPTED : COLOR_DENIED)
        .setTitle(`Your JointNet request was ${accepted ? 'accepted' : 'denied'}`)
        .setDescription(reason ? `**Reason:** ${clip(reason, 1500)}` : null)
        .setTimestamp()],
    });
  } catch { dmed = false; }

  return interaction.followUp({
    content: `${accepted ? '✅ Accepted' : '❌ Denied'}.${roleLines.length ? `\n${roleLines.join('\n')}` : ''}${dmed ? '' : ' (I couldn\'t DM the requester; their DMs may be closed.)'}`,
    flags: MessageFlags.Ephemeral,
  });
}

// ── exports ──────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('request')
    .setDescription('Request access (only for members without the Cleared role)')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    if (isCleared(interaction.member)) {
      return interaction.reply({ content: ALREADY_CLEARED_MSG, flags: MessageFlags.Ephemeral });
    }
    return openModal(interaction);
  },

  // Buttons and modals whose customId starts with "request:" arrive here (see index.js).
  async component(interaction) {
    const [, action, arg] = interaction.customId.split(':');

    if (interaction.isModalSubmit()) {
      if (action === 'submit') return handleSubmit(interaction);

      if (action === 'denyreason') {
        if (!isStaff(interaction.member)) return deny(interaction);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const message = await interaction.channel.messages.fetch(arg).catch(() => null);
        if (!message?.embeds?.[0]) return interaction.editReply('I couldn\'t find that request message any more.');
        const reason = (interaction.fields.getTextInputValue('reason') || '').trim();
        return finish(interaction, message, false, reason);
      }
      return;
    }

    if (interaction.isButton()) {
      if (!isStaff(interaction.member)) return deny(interaction);

      if (action === 'accept') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        return finish(interaction, interaction.message, true, null);
      }

      if (action === 'deny') {
        return interaction.showModal(
          new ModalBuilder()
            .setCustomId(`request:denyreason:${interaction.message.id}`)
            .setTitle('Deny request')
            .addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('reason').setLabel('Reason (optional, sent to the requester)')
                .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(900))),
        );
      }
    }
  },

  // exposed for testing
  _test: { buildMainEmbed, buildGroupEmbeds, makeNickname, grantAccessRoles },
};
