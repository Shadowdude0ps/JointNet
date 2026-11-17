// Flagged Roblox groups. When a requester is in one, the request post highlights it.
// Saved in the database; managed with /groupflag.
const db = require('./db');

const store = () => db.get('groupflags', { groups: {} });

/** { [groupId]: { name, reason, addedBy, at } } */
const getFlags = () => store().groups;

const getFlag = groupId => store().groups[String(groupId)] ?? null;

function addFlag(groupId, { name, reason, addedBy }) {
  store().groups[String(groupId)] = { name, reason, addedBy, at: Date.now() };
  db.save('groupflags');
}

function removeFlag(groupId) {
  const groups = store().groups;
  if (!groups[String(groupId)]) return false;
  delete groups[String(groupId)];
  db.save('groupflags');
  return true;
}

/** The user's groups (from roblox.getUserGroups) that are flagged → [{ group, role, flag }] */
function flaggedIn(userGroups) {
  return userGroups
    .map(g => ({ ...g, flag: getFlag(g.group.id) }))
    .filter(g => g.flag);
}

module.exports = { getFlags, getFlag, addFlag, removeFlag, flaggedIn };
