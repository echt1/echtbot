const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FILES = {
  warnings: path.join(DATA_DIR, 'warnings.json'),
  automod: path.join(DATA_DIR, 'automod.json'),
  tickets: path.join(DATA_DIR, 'tickets.json'),
  social: path.join(DATA_DIR, 'social.json'),
  counting: path.join(DATA_DIR, 'counting.json'),
  ticketlogs: path.join(DATA_DIR, 'ticketlogs.json'),
  giveaways: path.join(DATA_DIR, 'giveaways.json'),
  j2c: path.join(DATA_DIR, 'j2c.json'),
  customcommands: path.join(DATA_DIR, 'customcommands.json'),
  ccvars: path.join(DATA_DIR, 'ccvars.json'),
  nominationTypes: path.join(DATA_DIR, 'nominationTypes.json'),
  nominations: path.join(DATA_DIR, 'nominations.json'),
  linkedroles: path.join(DATA_DIR, 'linkedroles.json'),
  afk: path.join(DATA_DIR, 'afk.json'),
  sticky: path.join(DATA_DIR, 'sticky.json'),
  serverstats: path.join(DATA_DIR, 'serverstats.json'),
  reactionroles: path.join(DATA_DIR, 'reactionroles.json'),
  welcomer: path.join(DATA_DIR, 'welcomer.json'),
  starboard: path.join(DATA_DIR, 'starboard.json'),
  leveling: path.join(DATA_DIR, 'leveling.json'),
  levelingusers: path.join(DATA_DIR, 'levelingusers.json'),
  birthdays: path.join(DATA_DIR, 'birthdays.json'),
  birthdayconfig: path.join(DATA_DIR, 'birthdayconfig.json'),
  countdowns: path.join(DATA_DIR, 'countdowns.json'),
};

function readJSON(file) {
  if (!fs.existsSync(file)) return {};
  try {
    const raw = fs.readFileSync(file, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error(`[DB] Konnte ${file} nicht lesen, starte mit leerem Objekt:`, err.message);
    return {};
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// Generischer Store pro Datei: db.get('automod'), db.set('automod', data)
const cache = {};
for (const key of Object.keys(FILES)) {
  cache[key] = readJSON(FILES[key]);
}

module.exports = {
  get(store) {
    return cache[store];
  },
  set(store, data) {
    cache[store] = data;
    writeJSON(FILES[store], data);
  },
  save(store) {
    writeJSON(FILES[store], cache[store]);
  },
};

// Presets separat (nicht mit anderen Stores vermischt)
const PRESETS_FILE = path.join(DATA_DIR, 'presets.json');
cache['presets'] = readJSON(PRESETS_FILE);
FILES['presets'] = PRESETS_FILE;
