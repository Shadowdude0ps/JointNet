// National Threat Level: wording, colours, images and the saved current level.
// Images live in /assets and are named ntl_<level>.jpg (critical, severe, substantial, moderate, low).
const fs = require('fs');
const path = require('path');
const db = require('./db');

const ASSETS = path.join(__dirname, '..', 'assets');

const RED = 0xFF0000, ORANGE = 0xEC7818, YELLOW = 0xF2B90F, BLUE = 0x3D7AE0, GREEN = 0x6A8E23;

const THREAT = {
  prefix: 'ntl',
  title: 'NATIONAL THREAT LEVEL',
  intro:
    'The National Threat Level is a framework set out in the National Security Act 2023 used to communicate the current level of threat of attack against the Nation and its Citizens. Its goal is to provide clear and timely information so that appropriate safety and security measures can be taken.\n\n' +
    'The National Threat Level shall be decided on by the National Security Committee following a simple majority vote.',
  org: 'NSC',
  levels: [
    { key: 'critical',    label: 'CRITICAL',    color: RED },
    { key: 'severe',      label: 'SEVERE',      color: ORANGE },
    { key: 'substantial', label: 'SUBSTANTIAL', color: YELLOW },
    { key: 'moderate',    label: 'MODERATE',    color: BLUE },
    { key: 'low',         label: 'LOW',         color: GREEN },
  ],
};

const choices = () => THREAT.levels.map(l => ({ name: l.label, value: l.key }));

/** Message payload ({ embeds, files, level }) for a threat level announcement. */
function buildPost(levelKey) {
  const level = THREAT.levels.find(l => l.key === levelKey);
  const fileName = `${THREAT.prefix}_${level.key}.jpg`;
  const filePath = path.join(ASSETS, fileName);
  const hasImage = fs.existsSync(filePath);

  const embed = {
    color: level.color,
    title: THREAT.title,
    description: `${THREAT.intro}\n\n**CURRENT LEVEL: ${level.label}**`,
    footer: { text: `Confirmed - ${THREAT.org}` },
    timestamp: new Date().toISOString(),
  };
  if (hasImage) embed.image = { url: `attachment://${fileName}` };

  return { embeds: [embed], files: hasImage ? [{ attachment: filePath, name: fileName }] : [], level };
}

function setCurrent(key) {
  const data = db.get('threat', {});
  data.key = key;
  data.at = new Date().toISOString();
  db.save('threat');
}

/** { key, label, at } or null if no level has been posted yet. */
function getCurrent() {
  try {
    const data = db.get('threat', {});
    const level = THREAT.levels.find(l => l.key === data.key);
    return level ? { key: level.key, label: level.label, at: data.at ?? null } : null;
  } catch {
    return null;
  }
}

module.exports = { THREAT, choices, buildPost, setCurrent, getCurrent };
