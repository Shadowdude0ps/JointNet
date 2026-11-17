/**
 * Persistence layer.
 *  - With MONGODB_URI set: data lives in MongoDB Atlas (survives Render restarts).
 *  - Without it: falls back to JSON files in /data (fine for local testing only).
 *
 * Everything is cached in memory, so reads are synchronous. Call save(key) after
 * mutating a value returned from get(key, default).
 */
const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const cache = {};
const writeChains = {};
let collection = null;
let client = null;

const clone = v => JSON.parse(JSON.stringify(v));

async function init() {
  if (process.env.MONGODB_URI) {
    const { MongoClient } = require('mongodb');
    client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    collection = client.db(process.env.MONGODB_DB || 'jointnet').collection('store');
    const docs = await collection.find({}).toArray();
    for (const d of docs) cache[d._id] = d.value;
    console.log(`✅ MongoDB connected (${docs.length} stored key(s)).`);
  } else {
    console.warn('⚠️  MONGODB_URI not set: using local JSON files. Data will NOT survive a Render restart.');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const f of fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'))) {
      try { cache[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch { /* ignore bad file */ }
    }
  }
}

function get(key, def) {
  if (cache[key] === undefined) cache[key] = clone(def);
  return cache[key];
}

function save(key) {
  const value = cache[key];
  const prev  = writeChains[key] ?? Promise.resolve();
  writeChains[key] = prev.then(async () => {
    try {
      if (collection) {
        await collection.replaceOne({ _id: key }, { _id: key, value }, { upsert: true });
      } else {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(path.join(DATA_DIR, `${key}.json`), JSON.stringify(value, null, 2));
      }
    } catch (err) {
      console.error(`❌ Failed to save "${key}":`, err.message);
    }
  });
  return writeChains[key];
}

module.exports = { init, get, save };
