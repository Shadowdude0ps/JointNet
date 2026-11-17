const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const { idList } = require('./config');

// The bot owner and server Administrators can always do everything.
function isOwnerOrAdmin(member) {
  if (!member) return false;
  if (member.id === process.env.OWNER_ID) return true;
  return Boolean(member.permissions?.has(PermissionFlagsBits.Administrator));
}

function hasAnyRole(member, envName) {
  const ids = idList(envName);
  if (!ids.length) return false;
  return Boolean(member?.roles?.cache?.some(r => ids.includes(r.id)));
}

/** Reviewing requests (Accept / Deny) and /groupflag list */
function isStaff(member) {
  return isOwnerOrAdmin(member) || hasAnyRole(member, 'STAFF_ROLE_IDS');
}

/** /event and /schedule */
function canRunEvents(member) {
  return isOwnerOrAdmin(member) || hasAnyRole(member, 'EVENT_ROLE_IDS');
}

/** /threatlevel */
function canSetThreat(member) {
  return isOwnerOrAdmin(member) || hasAnyRole(member, 'THREAT_ROLE_IDS');
}

function deny(interaction, text = 'You don\'t have permission to do that.') {
  return interaction.reply({ content: `🚫 ${text}`, flags: MessageFlags.Ephemeral });
}

module.exports = { isStaff, canRunEvents, canSetThreat, isAdmin: isOwnerOrAdmin, deny };
