// Group binds: "if the user is in Roblox group X with rank >= N, give Discord role R".
// Saved in the database, so they survive restarts. Managed with /groupbind.
const db = require('./db');

const store = () => db.get('groupbinds', { list: [] });

/** [{ groupId, groupName, minRank, roleId }] */
const getBinds = () => store().list;

/** Adds a bind (replaces an existing one for the same group + role). */
function addBind({ groupId, groupName, minRank, roleId }) {
  const data = store();
  data.list = data.list.filter(b => !(b.groupId === groupId && b.roleId === roleId));
  data.list.push({ groupId, groupName, minRank, roleId });
  db.save('groupbinds');
}

/** Removes every bind for that group + role. Returns how many were removed. */
function removeBind(groupId, roleId) {
  const data = store();
  const before = data.list.length;
  data.list = data.list.filter(b => !(b.groupId === groupId && b.roleId === roleId));
  db.save('groupbinds');
  return before - data.list.length;
}

/** Binds a user qualifies for, given their Roblox groups (from roblox.getUserGroups). */
function matchingBinds(userGroups) {
  return getBinds().filter(b =>
    userGroups.some(g => g.group.id === b.groupId && (g.role?.rank ?? 0) >= b.minRank));
}

module.exports = { getBinds, addBind, removeBind, matchingBinds };
