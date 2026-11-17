// Bot status under its name, rotating every 30 seconds.
const { ActivityType } = require('discord.js');
const { getCurrent } = require('./threat');

const EVERY_MS = 30_000;
const STATUS = 'online'; // 'online', 'idle', 'dnd' or 'invisible'
let timer = null;
let turn = 0;

function buildStatuses() {
  const list = [{ type: ActivityType.Watching, name: 'over JointNet' }];
  const threat = getCurrent();
  if (threat) list.push({ type: ActivityType.Watching, name: `National Threat Level: ${threat.label}` });
  list.push({ type: ActivityType.Listening, name: '/request' });
  return list;
}

function update(client) {
  const list = buildStatuses();
  client.user.setPresence({ status: STATUS, activities: [list[turn % list.length]] });
  turn += 1;
}

function start(client) {
  if (timer) return;
  update(client);
  timer = setInterval(() => update(client), EVERY_MS);
}

module.exports = { start };
