/* In-memory registry of songs and playable queues for the current view. */

const songs = new Map();
const queues = new Map();

export function registerSongs(list = []) {
  list.filter(Boolean).forEach((song) => {
    if (!song.id) return;
    const previous = songs.get(song.id) || {};
    songs.set(song.id, { ...previous, ...song });
  });
}

export function registerQueue(name, list = []) {
  if (!name) return;
  queues.set(name, list.filter(Boolean));
  registerSongs(list);
}

export function getSong(id) {
  return songs.get(id) || null;
}

export function getQueue(name) {
  return queues.get(name) || [];
}

export function clearQueues(prefix = "") {
  if (!prefix) {
    queues.clear();
    return;
  }
  [...queues.keys()].forEach((key) => {
    if (key.startsWith(prefix)) queues.delete(key);
  });
}
