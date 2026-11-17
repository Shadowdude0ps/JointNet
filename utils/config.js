// Channel and role IDs come from environment variables (set them in Render).
const CHANNEL_ENV = {
  level:           'LEVEL_CHANNEL_ID',            // /threatlevel
  schedule:        'SCHEDULE_CHANNEL_ID',         // /schedule
  events:          'EVENTS_CHANNEL_ID',           // /event (Ceremonial, Deployments, Trainings)
  civilDeployment: 'CIVIL_DEPLOYMENT_CHANNEL_ID', // /event type: Civil Deployments
  requests:        'REQUESTS_CHANNEL_ID',         // /request results
};

function channelEnvName(kind) { return CHANNEL_ENV[kind]; }

/** Fetch a configured channel. Returns null if unset or not accessible. */
async function getChannel(client, kind) {
  const id = process.env[CHANNEL_ENV[kind]];
  if (!id) return null;
  try { return await client.channels.fetch(id); } catch { return null; }
}

/** Reads a comma-separated list of IDs from an environment variable. */
function idList(envName) {
  return (process.env[envName] || '').split(',').map(s => s.trim()).filter(Boolean);
}

module.exports = { getChannel, channelEnvName, idList };
