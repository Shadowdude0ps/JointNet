// Small Roblox web API client (public endpoints, no API key needed).
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Each request gets this long and is tried at most (RETRIES + 1) times, so a slow
// Roblox can never leave a Discord interaction hanging.
const TIMEOUT_MS = Number(process.env.ROBLOX_TIMEOUT_MS) || 6000;
const RETRIES = 1;

async function robloxFetch(url, options = {}, attempt = 0) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'jointnet/1.0', ...(options.headers || {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    console.log(`[roblox] ${res.status} ${Date.now() - started}ms ${url}`);

    if ([429, 500, 502, 503, 504].includes(res.status) && attempt < RETRIES) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      await sleep(retryAfter > 0 ? Math.min(retryAfter * 1000, 3000) : 1500 * (attempt + 1));
      return robloxFetch(url, options, attempt + 1);
    }
    if (!res.ok || res.status === 204) return null;
    return await res.json();
  } catch (err) {
    console.error(`[roblox] ${url} failed after ${Date.now() - started}ms:`, err.message);
    if (attempt < RETRIES) {
      await sleep(1500 * (attempt + 1));
      return robloxFetch(url, options, attempt + 1);
    }
    return null;
  }
}

const enc = encodeURIComponent;

// Username → { Id, Username, DisplayName } or null
async function getUserByName(username) {
  const data = await robloxFetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });
  const u = data?.data?.[0];
  return u ? { Id: u.id, Username: u.name, DisplayName: u.displayName } : null;
}

// ID → full profile or null
async function getUserById(userId) {
  const data = await robloxFetch(`https://users.roblox.com/v1/users/${enc(userId)}`);
  if (!data?.id) return null;
  return {
    Id: data.id,
    Username: data.name,
    DisplayName: data.displayName,
    description: data.description ?? '',
    created: data.created ?? null,
    isBanned: Boolean(data.isBanned),
    hasVerifiedBadge: Boolean(data.hasVerifiedBadge),
  };
}

// Previous usernames → [{ name }]
async function getUsernameHistory(userId) {
  const data = await robloxFetch(`https://users.roblox.com/v1/users/${enc(userId)}/username-history?limit=100&sortOrder=Desc`);
  return (data?.data ?? []).map(n => ({ name: n.name }));
}

async function count(url) {
  const data = await robloxFetch(url);
  return typeof data?.count === 'number' ? data.count : null;
}
const getFriendCount    = id => count(`https://friends.roblox.com/v1/users/${enc(id)}/friends/count`);
const getFollowerCount  = id => count(`https://friends.roblox.com/v1/users/${enc(id)}/followers/count`);
const getFollowingCount = id => count(`https://friends.roblox.com/v1/users/${enc(id)}/followings/count`);

// Groups → [{ group: { id, name, memberCount, ... }, role: { name, rank } }]
async function getUserGroups(userId) {
  const data = await robloxFetch(`https://groups.roblox.com/v2/users/${enc(userId)}/groups/roles`);
  return (data?.data ?? []).filter(g => g?.group?.name);
}

// Headshot URL or null
async function getAvatarUrl(userId) {
  const data = await robloxFetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${enc(userId)}&size=420x420&format=Png&isCircular=false`);
  const item = data?.data?.[0];
  return item?.state === 'Completed' ? item.imageUrl : null;
}

// Group details ({ id, name, memberCount, ... }) or null
async function getGroupById(groupId) {
  const data = await robloxFetch(`https://groups.roblox.com/v1/groups/${enc(groupId)}`);
  return data?.id ? data : null;
}

// Whole days since the account was created, or null
function accountAgeDays(created) {
  const t = new Date(created).getTime();
  if (!created || Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

module.exports = {
  getUserByName, getUserById, getUsernameHistory,
  getFriendCount, getFollowerCount, getFollowingCount,
  getUserGroups, getGroupById, getAvatarUrl, accountAgeDays,
};
