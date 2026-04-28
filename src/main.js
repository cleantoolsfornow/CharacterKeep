import guideText from './assets/guide.md?raw';
import {
  hasTauri,
  tauriDialogConfirm,
  tauriDialogOpen,
  tauriDialogSave,
  tauriInvoke,
  tauriOpenExternal
} from './tauriBridge.js';

const DATA_FILE = 'data/characters.json';
const COLLECTIONS_FILE = 'data/collections.json';
const SETTINGS_FILE = 'data/settings.json';
const KO_FI_URL = 'https://ko-fi.com/cleantoolsfornow';

const state = {
  view: 'characters',
  characters: [],
  collections: [],
  settings: { theme: 'system', viewMode: 'card' },
  query: '',
  filters: { favorite: false, archived: false, tag: '', model: '', gallery: false, scenes: false, collection: 'all' },
  sort: 'updated',
  selectedId: null,
  draft: null,
  dirty: false,
  saveStatus: 'saved',
  createDialog: { open: false, title: '', subtitle: '', error: '' },
  exportDialog: { open: false, format: 'zip', includePrivate: false, includeGallery: true, includeMarkdown: true, includeTxt: false },
  preflight: null,
  importResult: null,
  selectedIds: new Set(),
  lastSelectedId: null,
  imageCache: new Map(),
  dataPath: ''
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const nowIso = () => new Date().toISOString();
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

class WriteQueue {
  constructor({ debounceMs = 120 } = {}) {
    this.debounceMs = debounceMs;
    this.pending = new Map();
    this.queues = new Map();
  }
  enqueue(key, payload, writeFn) {
    return new Promise((resolve, reject) => {
      const entry = this.pending.get(key) || { payload: null, resolves: [], rejects: [], timer: null };
      entry.payload = payload;
      entry.resolves.push(resolve);
      entry.rejects.push(reject);
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => this.flush(key, writeFn), this.debounceMs);
      this.pending.set(key, entry);
    });
  }
  async flush(key, writeFn) {
    const entry = this.pending.get(key);
    if (!entry) return;
    this.pending.delete(key);
    const previous = this.queues.get(key) || Promise.resolve();
    const next = previous.then(() => writeFn(entry.payload));
    this.queues.set(key, next.catch(() => undefined));
    try {
      await next;
      entry.resolves.forEach((resolve) => resolve());
    } catch (error) {
      entry.rejects.forEach((reject) => reject(error));
    }
  }
}
const writeQueue = new WriteQueue();

function defaultCharacter(title = 'Untitled Character') {
  const now = nowIso();
  return {
    id: uid(), schemaVersion: 1, type: 'roleplay_character', title, subtitle: '', collectionId: null,
    previewImageId: null, systemPrompt: '', authorsNote: '', notes: '', scenes: [], tags: [], compatibleModels: [],
    settingsNotes: '', gallery: [], favorite: false, archived: false, extensions: { characterkeep: {} }, createdAt: now, updatedAt: now
  };
}

function defaultCollection(name = 'New Collection') {
  const now = nowIso();
  return { id: uid(), name, description: '', color: '', archived: false, createdAt: now, updatedAt: now };
}

function normalizeNamedArray(value) {
  return Array.isArray(value) ? value.filter(Boolean).map((item) => {
    if (typeof item === 'string') return { id: uid(), name: item };
    return { id: item.id || uid(), name: String(item.name || item.label || '').trim(), ...item };
  }).filter((item) => item.name) : [];
}

function normalizeScenes(value) {
  return Array.isArray(value) ? value.filter(Boolean).map((scene) => ({ id: scene.id || uid(), title: String(scene.title || ''), body: String(scene.body || scene.text || ''), tags: Array.isArray(scene.tags) ? scene.tags : [], createdAt: scene.createdAt || nowIso(), updatedAt: scene.updatedAt || nowIso(), ...scene })) : [];
}

function normalizeGallery(value) {
  return Array.isArray(value) ? value.filter(Boolean).map((image) => ({ id: image.id || uid(), filename: image.filename || '', originalPath: image.originalPath || '', thumbnailPath: image.thumbnailPath || '', caption: image.caption || '', notes: image.notes || '', isCover: Boolean(image.isCover), createdAt: image.createdAt || nowIso(), updatedAt: image.updatedAt || nowIso(), ...image })) : [];
}

function normalizeCharacter(character) {
  const base = defaultCharacter(character?.title || 'Untitled Character');
  const next = { ...base, ...(character || {}) };
  next.schemaVersion = Number.isFinite(next.schemaVersion) ? next.schemaVersion : 1;
  next.title = String(next.title || 'Untitled Character');
  next.subtitle = String(next.subtitle || '');
  next.collectionId = typeof next.collectionId === 'string' && next.collectionId ? next.collectionId : null;
  next.systemPrompt = String(next.systemPrompt || '');
  next.authorsNote = String(next.authorsNote || '');
  next.notes = String(next.notes || '');
  next.settingsNotes = String(next.settingsNotes || '');
  next.scenes = normalizeScenes(next.scenes);
  next.tags = normalizeNamedArray(next.tags);
  next.compatibleModels = normalizeNamedArray(next.compatibleModels);
  next.gallery = normalizeGallery(next.gallery);
  next.favorite = Boolean(next.favorite);
  next.archived = Boolean(next.archived);
  next.extensions = next.extensions && typeof next.extensions === 'object' ? next.extensions : { characterkeep: {} };
  next.extensions.characterkeep = next.extensions.characterkeep && typeof next.extensions.characterkeep === 'object' ? next.extensions.characterkeep : {};
  return next;
}

function normalizeCollection(collection) {
  const base = defaultCollection(collection?.name || 'Untitled Collection');
  const next = { ...base, ...(collection || {}) };
  next.name = String(next.name || 'Untitled Collection');
  next.description = String(next.description || '');
  next.color = String(next.color || '');
  next.archived = Boolean(next.archived);
  return next;
}

function normalizeSettings(settings) {
  return {
    ...(settings && typeof settings === 'object' ? settings : {}),
    theme: ['system', 'light', 'dark'].includes(settings?.theme) ? settings.theme : 'system',
    viewMode: ['card', 'list'].includes(settings?.viewMode) ? settings.viewMode : 'card'
  };
}

function toast(message, tone = 'default') {
  const region = $('#toast-region');
  const node = document.createElement('div');
  node.className = `toast ${tone}`;
  node.textContent = message;
  region.appendChild(node);
  setTimeout(() => node.classList.add('visible'), 20);
  setTimeout(() => { node.classList.remove('visible'); setTimeout(() => node.remove(), 220); }, 3200);
}

async function confirmAction(message, title = 'Confirm') {
  if (hasTauri()) return tauriDialogConfirm(message, { title, kind: 'warning' });
  return window.confirm(`${title}\n\n${message}`);
}

async function readJson(path, fallback) {
  if (!hasTauri()) {
    const raw = localStorage.getItem(`characterkeep:${path}`);
    return raw ? JSON.parse(raw) : fallback;
  }
  try { return JSON.parse(await tauriInvoke('read_json_file', { filename: path })); } catch { return fallback; }
}

async function writeJsonNow(path, value) {
  if (!hasTauri()) {
    localStorage.setItem(`characterkeep:${path}`, JSON.stringify(value));
    return;
  }
  await tauriInvoke('write_json_file', { filename: path, content: JSON.stringify(value, null, 2) });
}
const writeJson = (path, value) => writeQueue.enqueue(path, structuredClone(value), (payload) => writeJsonNow(path, payload));

async function loadImage(path) {
  if (!path) return '';
  if (state.imageCache.has(path)) return state.imageCache.get(path);
  try {
    const url = hasTauri() ? await tauriInvoke('get_image_data_url', { relativePath: path }) : '';
    state.imageCache.set(path, url);
    return url;
  } catch {
    state.imageCache.set(path, '');
    return '';
  }
}

function applyTheme() { document.documentElement.dataset.theme = state.settings.theme || 'system'; }
function collectionById(id) { return state.collections.find((collection) => collection.id === id); }
function collectionLabel(id) { return id ? collectionById(id)?.name || 'Missing collection' : 'Unfiled'; }
async function saveCharacters(message) { await writeJson(DATA_FILE, state.characters); if (message) toast(message); }
async function saveCollections(message) { await writeJson(COLLECTIONS_FILE, state.collections); if (message) toast(message); }
async function saveSettings(message) { await writeJson(SETTINGS_FILE, state.settings); applyTheme(); if (message) toast(message); }
function setSaveStatus(status) { state.saveStatus = status; const node = $('.save-status'); if (node) { node.textContent = saveStatusText(); node.dataset.status = status; } }
function saveStatusText() { return state.saveStatus === 'saving' ? 'Saving...' : state.saveStatus === 'failed' ? 'Save failed' : state.saveStatus === 'unsaved' ? 'Unsaved changes' : 'Saved'; }
function markDraftDirty() { state.dirty = true; setSaveStatus('unsaved'); }
function findCharacter(id) { return state.characters.find((character) => character.id === id); }
function allTags() { return [...new Set(state.characters.flatMap((c) => c.tags.map((tag) => tag.name)).filter(Boolean))].sort(); }
function allModels() { return [...new Set(state.characters.flatMap((c) => c.compatibleModels.map((model) => model.name)).filter(Boolean))].sort(); }

function searchableText(character) {
  return [character.title, character.subtitle, character.systemPrompt, character.authorsNote, character.notes, character.settingsNotes, collectionLabel(character.collectionId), ...character.scenes.flatMap((scene) => [scene.title, scene.body]), ...character.tags.map((tag) => tag.name), ...character.compatibleModels.map((model) => model.name)].join(' ').toLowerCase();
}

function filteredCharacters() {
  const query = state.query.trim().toLowerCase();
  let items = state.characters.filter((character) => {
    if (state.filters.archived && !character.archived) return false;
    if (!state.filters.archived && character.archived) return false;
    if (state.filters.favorite && !character.favorite) return false;
    if (state.filters.gallery && !character.gallery.length) return false;
    if (state.filters.scenes && !character.scenes.length) return false;
    if (state.filters.tag && !character.tags.some((tag) => tag.name === state.filters.tag)) return false;
    if (state.filters.model && !character.compatibleModels.some((model) => model.name === state.filters.model)) return false;
    if (state.filters.collection === 'unfiled' && character.collectionId) return false;
    if (!['all', 'unfiled'].includes(state.filters.collection) && character.collectionId !== state.filters.collection) return false;
    return !query || searchableText(character).includes(query);
  });
  return items.sort((a, b) => {
    if (state.sort === 'az') return a.title.localeCompare(b.title);
    if (state.sort === 'za') return b.title.localeCompare(a.title);
    if (state.sort === 'created') return new Date(b.createdAt) - new Date(a.createdAt);
    if (state.sort === 'favorite') return Number(b.favorite) - Number(a.favorite) || new Date(b.updatedAt) - new Date(a.updatedAt);
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

function formatDate(value) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}
function timestampSlug() { return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13); }
function dateSlug() { return new Date().toISOString().slice(0, 10); }
function safeSlug(value) { return String(value || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || 'character'; }
function chipMarkup(items, className = '') { return items.map((item) => `<span class="chip ${className}">${escapeHtml(item.name || item)}</span>`).join(''); }

function assemblePrompt(character) {
  const scenes = character.scenes.filter((scene) => scene.title || scene.body).map((scene) => `### ${scene.title || 'Starter Scene'}\n${scene.body || ''}`).join('\n\n');
  return [`# Character: ${character.title}`, character.systemPrompt && `## System Prompt\n${character.systemPrompt}`, character.authorsNote && `## Author's Note\n${character.authorsNote}`, scenes && `## Starter Scenes\n${scenes}`, character.settingsNotes && `## Settings Notes\n${character.settingsNotes}`].filter(Boolean).join('\n\n');
}

function characterMarkdown(character, includePrivate = false) {
  const lines = [`# ${character.title}`, character.subtitle && `_${character.subtitle}_`, '', character.tags.length && `**Tags:** ${character.tags.map((tag) => tag.name).join(', ')}`, character.compatibleModels.length && `**Compatible Models:** ${character.compatibleModels.map((model) => model.name).join(', ')}`, character.collectionId && `**Collection:** ${collectionLabel(character.collectionId)}`, '', '## System Prompt', character.systemPrompt || '_Empty_', '', "## Author's Note", character.authorsNote || '_Empty_', '', '## Starter Scenes'];
  if (character.scenes.length) character.scenes.forEach((scene) => lines.push('', `### ${scene.title || 'Starter Scene'}`, scene.body || '_Empty_'));
  else lines.push('_No starter scenes._');
  lines.push('', '## Settings Notes', character.settingsNotes || '_Empty_');
  if (includePrivate) lines.push('', '## Private Notes', character.notes || '_Empty_');
  return lines.filter((line) => line !== false && line !== undefined).join('\n');
}

function characterTxt(character, includePrivate = false) {
  return [character.title, character.subtitle, '', 'SYSTEM PROMPT', character.systemPrompt, '', "AUTHOR'S NOTE", character.authorsNote, '', 'STARTER SCENES', character.scenes.map((scene) => `${scene.title || 'Starter Scene'}\n${scene.body}`).join('\n\n'), '', 'SETTINGS NOTES', character.settingsNotes, includePrivate ? `\nPRIVATE NOTES\n${character.notes}` : ''].filter(Boolean).join('\n');
}

async function copyText(text, message) { await navigator.clipboard.writeText(text || ''); toast(message); }
function openCreateDialog() { state.createDialog = { open: true, title: '', subtitle: '', error: '' }; render().then(() => $('#new-character-title')?.focus()); }
function closeCreateDialog() { state.createDialog = { open: false, title: '', subtitle: '', error: '' }; render(); }
async function createCharacterFromDialog() {
  const title = state.createDialog.title.trim();
  if (!title) { state.createDialog.error = 'Title is required.'; render().then(() => $('#new-character-title')?.focus()); return; }
  const character = { ...defaultCharacter(title), subtitle: state.createDialog.subtitle.trim(), collectionId: ['all', 'unfiled'].includes(state.filters.collection) ? null : state.filters.collection };
  state.characters = [character, ...state.characters];
  await saveCharacters('Character created');
  state.createDialog = { open: false, title: '', subtitle: '', error: '' };
  openEditor(character.id);
}

function openEditor(id) { state.selectedId = id; state.draft = structuredClone(findCharacter(id)); state.dirty = false; state.saveStatus = 'saved'; render(); }
async function closeEditor() {
  if (state.dirty && !(await confirmAction('Discard unsaved changes for this character?', 'Unsaved changes'))) return;
  state.selectedId = null; state.draft = null; state.dirty = false; state.saveStatus = 'saved'; state.exportDialog.open = false; render();
}
async function saveDraft() {
  const title = state.draft.title.trim();
  if (!title) { toast('Title is required', 'danger'); return false; }
  setSaveStatus('saving');
  try {
    const savedDraft = normalizeCharacter({ ...structuredClone(state.draft), title, updatedAt: nowIso() });
    state.characters = state.characters.map((character) => character.id === savedDraft.id ? savedDraft : character);
    await saveCharacters('Character saved');
    state.draft = structuredClone(savedDraft); state.dirty = false; setSaveStatus('saved'); render(); return true;
  } catch (error) { console.error(error); state.dirty = true; setSaveStatus('failed'); toast('Could not save character.', 'danger'); return false; }
}

async function duplicateCharacter(id) {
  const original = findCharacter(id); if (!original) return;
  const oldId = original.id; const newId = uid(); const now = nowIso(); const imageCopies = [];
  const gallery = original.gallery.map((image) => {
    const imageId = uid(); const extension = image.filename?.split('.').pop() || 'jpg';
    const originalPath = `media/characters/${newId}/originals/${imageId}.${extension}`; const thumbnailPath = `media/characters/${newId}/thumbnails/${imageId}.jpg`;
    if (image.originalPath) imageCopies.push([image.originalPath, originalPath]); if (image.thumbnailPath) imageCopies.push([image.thumbnailPath, thumbnailPath]);
    return { ...image, id: imageId, originalPath, thumbnailPath, createdAt: now, updatedAt: now };
  });
  const duplicate = normalizeCharacter({ ...structuredClone(original), id: newId, title: `${original.title} Copy`, scenes: original.scenes.map((scene) => ({ ...scene, id: uid(), createdAt: now, updatedAt: now })), tags: original.tags.map((tag) => ({ ...tag, id: uid() })), compatibleModels: original.compatibleModels.map((model) => ({ ...model, id: uid() })), gallery, previewImageId: gallery.find((image) => image.isCover)?.id || gallery[0]?.id || null, createdAt: now, updatedAt: now });
  if (hasTauri()) for (const [sourceRelativePath, destRelativePath] of imageCopies) await tauriInvoke('copy_app_data_file', { sourceRelativePath, destRelativePath }).catch(console.warn);
  state.characters.unshift(duplicate); await saveCharacters('Character duplicated'); render();
}
async function archiveCharacter(id, archived = true) { const c = findCharacter(id); if (!c) return; c.archived = archived; c.updatedAt = nowIso(); await saveCharacters(archived ? 'Character archived' : 'Character restored'); render(); }
async function deleteCharacter(id) {
  const character = findCharacter(id); if (!character) return;
  const ok = await confirmAction(`This will permanently remove "${character.title}" and all local gallery files stored for it. This cannot be undone.`, `Permanently delete "${character.title}"?`);
  if (!ok) return;
  state.characters = state.characters.filter((item) => item.id !== id); state.selectedIds.delete(id);
  if (hasTauri()) await tauriInvoke('delete_path', { relativePath: `media/characters/${id}` }).catch(console.warn);
  if (state.selectedId === id) { state.selectedId = null; state.draft = null; state.dirty = false; }
  await saveCharacters('Character deleted'); render();
}

function cardCover(character) { return character.gallery.find((image) => image.id === character.previewImageId || image.isCover) || character.gallery[0]; }
async function renderCards() {
  const items = filteredCharacters();
  if (!state.characters.length) return `<section class="empty-state"><div class="empty-mark">CK</div><h2>No characters yet</h2><p>Create your first roleplay character or import a character-card PNG. Everything stays private on your device.</p><ul class="empty-help"><li>Only the title is required.</li><li>Character-card PNGs can become full records.</li><li>Images are copied into CharacterKeep's app data folder.</li></ul><div class="button-row"><button class="primary" data-action="create">Create Character</button><button data-action="import-card">Import Character Card</button></div></section>`;
  if (!items.length) return `<section class="empty-state"><h2>No matching characters</h2><p>Try changing search, collection, or filters.</p><button data-action="clear-filters">Clear Filters</button></section>`;
  if (state.settings.viewMode === 'list') return renderList(items);
  const cards = await Promise.all(items.map(async (character) => {
    const cover = cardCover(character); const imageUrl = await loadImage(cover?.thumbnailPath || cover?.originalPath); const checked = state.selectedIds.has(character.id);
    return `<article class="character-card ${checked ? 'selected' : ''}" data-action="open-editor" data-id="${character.id}" tabindex="0"><label class="select-box" title="Select"><input type="checkbox" data-select-id="${character.id}" ${checked ? 'checked' : ''} /></label><div class="card-art ${imageUrl ? 'has-image' : ''}">${imageUrl ? `<img src="${imageUrl}" alt="" />` : `<div class="placeholder"><span>${escapeHtml(character.title.slice(0, 1).toUpperCase() || 'C')}</span></div>`}${character.favorite ? '<span class="favorite-badge">★</span>' : ''}</div><div class="card-body"><div class="card-title-row"><h3>${escapeHtml(character.title)}</h3><span>${formatDate(character.updatedAt)}</span></div>${character.subtitle ? `<p>${escapeHtml(character.subtitle)}</p>` : '<p class="muted">No subtitle yet</p>'}<div class="chip-row"><span class="chip collection-chip">${escapeHtml(collectionLabel(character.collectionId))}</span>${chipMarkup(character.tags.slice(0, 3))}${chipMarkup(character.compatibleModels.slice(0, 2), 'model-chip')}</div><div class="card-meta"><span>${character.scenes.length} scenes</span><span>${character.gallery.length} images</span></div><div class="card-actions"><button class="card-action-button" data-action="copy-system" data-id="${character.id}"><span>⧉</span><em>Copy</em></button><button class="card-action-button" data-action="duplicate" data-id="${character.id}"><span>⎘</span><em>Duplicate</em></button><button class="card-action-button quiet" data-action="archive" data-id="${character.id}"><span>${character.archived ? '↥' : '↓'}</span><em>${character.archived ? 'Restore' : 'Archive'}</em></button></div></div></article>`;
  }));
  return `<section class="grid">${cards.join('')}</section>`;
}

async function renderList(items) {
  const rows = await Promise.all(items.map(async (character) => {
    const cover = cardCover(character); const imageUrl = await loadImage(cover?.thumbnailPath || cover?.originalPath); const checked = state.selectedIds.has(character.id);
    return `<tr class="character-row ${checked ? 'selected' : ''}" data-action="open-editor" data-id="${character.id}"><td><input type="checkbox" data-select-id="${character.id}" ${checked ? 'checked' : ''} /></td><td>${imageUrl ? `<img class="list-thumb" src="${imageUrl}" alt="" />` : `<span class="list-initial">${escapeHtml(character.title.slice(0, 1).toUpperCase() || 'C')}</span>`}</td><td><strong>${escapeHtml(character.title)}</strong><small>${escapeHtml(character.subtitle || 'No subtitle')}</small></td><td>${chipMarkup(character.tags.slice(0, 3))}</td><td>${chipMarkup(character.compatibleModels.slice(0, 2), 'model-chip')}</td><td>${escapeHtml(collectionLabel(character.collectionId))}</td><td>${character.scenes.length}</td><td>${character.gallery.length}</td><td>${formatDate(character.updatedAt)}</td><td>${character.favorite ? '★' : ''} ${character.archived ? 'Archived' : ''}</td><td><button data-action="copy-system" data-id="${character.id}">Copy</button></td></tr>`;
  }));
  return `<div class="list-wrap"><table class="character-list"><thead><tr><th></th><th></th><th>Title</th><th>Tags</th><th>Models</th><th>Collection</th><th>Scenes</th><th>Images</th><th>Updated</th><th>State</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function currentCollectionHeader() {
  if (state.filters.collection === 'all') return '';
  if (state.filters.collection === 'unfiled') return `<section class="collection-header"><div><p class="eyebrow">Collection filter</p><h2>Unfiled</h2><p>Characters without a collection.</p></div></section>`;
  const collection = collectionById(state.filters.collection); if (!collection) return '';
  return `<section class="collection-header"><div><p class="eyebrow">Collection</p><h2>${escapeHtml(collection.name)}</h2><p>${escapeHtml(collection.description || 'No description yet.')}</p></div><div class="button-row"><button data-action="rename-collection" data-id="${collection.id}">Rename</button><button class="danger" data-action="delete-collection" data-id="${collection.id}">Delete Collection</button></div></section>`;
}

function bulkToolbar() {
  if (!state.selectedIds.size) return '';
  return `<section class="bulk-toolbar"><strong>${state.selectedIds.size} selected</strong><button data-action="bulk-archive">Archive</button><button data-action="bulk-unarchive">Unarchive</button><button data-action="bulk-favorite">Favorite</button><button data-action="bulk-unfavorite">Unfavorite</button><button data-action="bulk-tag">Add Tag</button><button data-action="bulk-move">Move to Collection</button><button class="danger" data-action="bulk-delete">Delete</button><button data-action="select-clear">Clear</button></section>`;
}

async function renderCharactersView() {
  return `<main class="content"><header class="topbar"><div><p class="eyebrow">Private local vault</p><h1>Characters</h1></div><div class="button-row"><button data-action="import-card">Import Character Card</button><button class="primary" data-action="create">New Character</button></div></header>${currentCollectionHeader()}<section class="toolbar"><input id="search" type="search" placeholder="Search characters, scenes, tags, models..." value="${escapeHtml(state.query)}" /><select id="sort"><option value="updated" ${state.sort === 'updated' ? 'selected' : ''}>Recently edited</option><option value="created" ${state.sort === 'created' ? 'selected' : ''}>Recently created</option><option value="az" ${state.sort === 'az' ? 'selected' : ''}>A-Z</option><option value="za" ${state.sort === 'za' ? 'selected' : ''}>Z-A</option><option value="favorite" ${state.sort === 'favorite' ? 'selected' : ''}>Favorites first</option></select><button class="${state.settings.viewMode === 'card' ? 'active' : ''}" data-action="view-mode" data-mode="card">Cards</button><button class="${state.settings.viewMode === 'list' ? 'active' : ''}" data-action="view-mode" data-mode="list">List</button><button class="${state.filters.favorite ? 'active' : ''}" data-action="toggle-filter" data-filter="favorite">Favorites</button><button class="${state.filters.archived ? 'active' : ''}" data-action="toggle-filter" data-filter="archived">Archived</button><button class="${state.filters.gallery ? 'active' : ''}" data-action="toggle-filter" data-filter="gallery">Has gallery</button><button class="${state.filters.scenes ? 'active' : ''}" data-action="toggle-filter" data-filter="scenes">Has scenes</button><select id="tag-filter"><option value="">All tags</option>${allTags().map((tag) => `<option ${state.filters.tag === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`)}</select><select id="model-filter"><option value="">All models</option>${allModels().map((model) => `<option ${state.filters.model === model ? 'selected' : ''}>${escapeHtml(model)}</option>`)}</select></section>${bulkToolbar()}${await renderCards()}</main>`;
}

function settingsView() { return `<main class="content"><header class="topbar"><div><p class="eyebrow">Local-first</p><h1>Settings</h1></div></header><section class="settings-grid"><div class="panel"><h2>Appearance</h2><label>Theme<select id="theme-select"><option value="system" ${state.settings.theme === 'system' ? 'selected' : ''}>System</option><option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>Dark</option></select></label></div><div class="panel"><h2>Data</h2><p class="data-path">${escapeHtml(state.dataPath || 'Available in the desktop app')}</p><div class="button-row"><button data-action="open-data">Open Data Folder</button><button data-action="backup">Create Full Backup</button><button data-action="restore">Restore From Backup</button><button data-action="import-card">Import Character Card</button></div></div><div class="panel"><h2>Privacy</h2><p>CharacterKeep stores data locally on your device. It does not upload characters, prompts, images, or notes anywhere.</p></div><div class="panel"><h2>Support</h2><button data-action="kofi">Support development on Ko-fi</button></div></section></main>`; }
function helpView() { return `<main class="content"><header class="topbar"><div><p class="eyebrow">Guide</p><h1>Help</h1></div></header><article class="guide panel">${guideText.split('\n').map((line) => line.startsWith('# ') ? `<h2>${escapeHtml(line.slice(2))}</h2>` : line.startsWith('## ') ? `<h3>${escapeHtml(line.slice(3))}</h3>` : line.startsWith('- ') ? `<p class="guide-bullet">${escapeHtml(line.slice(2))}</p>` : line.trim() ? `<p>${escapeHtml(line)}</p>` : '').join('')}</article></main>`; }

function editorSection(title, body, className = '') { return `<section class="editor-section ${className}"><h2>${title}</h2>${body}</section>`; }
function renderChipEditor(kind, items) { return `<div class="chip-editor" data-kind="${kind}"><div class="chip-row">${items.map((item) => `<span class="chip">${escapeHtml(item.name)} <button data-action="remove-chip" data-kind="${kind}" data-id="${item.id}">×</button></span>`).join('')}</div><div class="inline-add"><input placeholder="${kind === 'tags' ? 'Add tag' : 'Add model'}" data-kind="${kind}" /><button data-action="add-chip" data-kind="${kind}">Add</button></div></div>`; }
function collectionSelect(selectedId) { return `<select data-field="collectionId"><option value="">Unfiled</option>${state.collections.map((collection) => `<option value="${collection.id}" ${selectedId === collection.id ? 'selected' : ''}>${escapeHtml(collection.name)}</option>`).join('')}</select>`; }

async function editorView() {
  const c = state.draft; if (!c) return '';
  const cover = cardCover(c); const coverUrl = await loadImage(cover?.thumbnailPath || cover?.originalPath);
  const gallery = await Promise.all(c.gallery.map(async (image) => { const url = await loadImage(image.thumbnailPath || image.originalPath); return `<article class="gallery-item ${url ? '' : 'is-missing'}"><button class="gallery-thumb" data-action="lightbox" data-id="${image.id}" ${url ? '' : 'disabled'}>${url ? `<img src="${url}" alt="${escapeHtml(image.caption || c.title)}" />` : '<span>Image missing</span>'}</button><input value="${escapeHtml(image.caption || '')}" data-gallery-field="caption" data-id="${image.id}" placeholder="Caption" /><textarea data-gallery-field="notes" data-id="${image.id}" placeholder="Image notes">${escapeHtml(image.notes || '')}</textarea><div class="button-row"><button data-action="set-cover" data-id="${image.id}">${image.id === c.previewImageId || image.isCover ? 'Cover' : 'Set cover'}</button><button class="danger" data-action="remove-image" data-id="${image.id}">Remove</button></div></article>`; }));
  return `<div class="editor-backdrop"><main class="editor-shell" role="dialog" aria-modal="true"><header class="editor-header"><div class="editor-avatar">${coverUrl ? `<img src="${coverUrl}" alt="" />` : `<span>${escapeHtml(c.title.slice(0, 1).toUpperCase() || 'C')}</span>`}</div><div class="editor-title-fields"><input class="title-input" value="${escapeHtml(c.title)}" data-field="title" /><input class="subtitle-input" value="${escapeHtml(c.subtitle)}" data-field="subtitle" placeholder="Subtitle or short description" /><span class="save-status" data-status="${state.saveStatus}">${saveStatusText()}</span></div><div class="editor-actions"><button class="${c.favorite ? 'active' : ''}" data-action="toggle-draft-bool" data-field="favorite">★</button><button data-action="copy-full">Copy Full</button><button data-action="open-export">Export</button><button data-action="save-draft" class="primary">Save</button><button data-action="duplicate" data-id="${c.id}">Duplicate</button><button data-action="toggle-draft-bool" data-field="archived">${c.archived ? 'Unarchive' : 'Archive'}</button><button class="danger" data-action="delete" data-id="${c.id}">Delete</button><button data-action="close-editor">×</button></div></header><div class="editor-grid"><div class="editor-column">${editorSection('Overview', `<label>Collection${collectionSelect(c.collectionId)}</label><label>Tags${renderChipEditor('tags', c.tags)}</label><label>Best compatible with${renderChipEditor('models', c.compatibleModels)}</label>`)}${editorSection('Scenes', `<div class="scene-list">${c.scenes.map((scene) => `<article class="scene" data-id="${scene.id}"><input value="${escapeHtml(scene.title)}" data-scene-field="title" data-id="${scene.id}" placeholder="Scene title" /><textarea data-scene-field="body" data-id="${scene.id}" placeholder="Starter scene">${escapeHtml(scene.body)}</textarea><div class="button-row"><button data-action="copy-scene" data-id="${scene.id}">Copy</button><button data-action="duplicate-scene" data-id="${scene.id}">Duplicate</button><button class="danger" data-action="delete-scene" data-id="${scene.id}">Delete</button></div></article>`).join('')}</div><button data-action="add-scene">Add Scene</button>`, 'scenes-section')}${editorSection('Notes', `<label>Private Notes<textarea class="medium" data-field="notes">${escapeHtml(c.notes)}</textarea></label><label>Settings Notes<textarea class="medium" data-field="settingsNotes">${escapeHtml(c.settingsNotes)}</textarea></label>`, 'notes-section')}</div><div class="editor-column">${editorSection('Prompt', `<label>System Prompt<textarea class="large" data-field="systemPrompt">${escapeHtml(c.systemPrompt)}</textarea></label><label>Author's Note<textarea class="medium" data-field="authorsNote">${escapeHtml(c.authorsNote)}</textarea></label><button data-action="copy-system" data-id="${c.id}">Copy System Prompt</button>`, 'prompt-section')}${editorSection('Gallery', `<div class="button-row"><button data-action="add-image">Add Images</button></div><div class="gallery-grid">${gallery.join('')}</div>`)}</div></div></main></div>`; }

function createCharacterDialog() { if (!state.createDialog.open) return ''; return `<div class="modal-backdrop" data-action="create-cancel"><section class="create-dialog" role="dialog"><div class="dialog-heading"><p class="eyebrow">New character</p><h2>Create Character</h2><p>Start with the name. Everything else can be filled in once the editor opens.</p></div><label><span class="field-label">Title</span><input id="new-character-title" data-create-field="title" value="${escapeHtml(state.createDialog.title)}" placeholder="Character name" /></label><label><span class="field-label">Subtitle <span class="optional">Optional</span></span><input data-create-field="subtitle" value="${escapeHtml(state.createDialog.subtitle)}" placeholder="Short description or role" /></label>${state.createDialog.error ? `<p class="form-error">${escapeHtml(state.createDialog.error)}</p>` : ''}<div class="dialog-actions"><button data-action="create-cancel">Cancel</button><button class="primary" data-action="create-submit">Create Character</button></div></section></div>`; }
function exportDialog() { if (!state.exportDialog.open || !state.draft) return ''; const d = state.exportDialog; return `<div class="modal-backdrop"><section class="create-dialog" role="dialog"><div class="dialog-heading"><p class="eyebrow">Export</p><h2>Export Character</h2><p>Private notes are excluded unless you opt in.</p></div><label>Format<select id="export-format"><option value="zip" ${d.format === 'zip' ? 'selected' : ''}>CharacterKeep backup ZIP</option><option value="markdown" ${d.format === 'markdown' ? 'selected' : ''}>Portable Markdown</option><option value="txt" ${d.format === 'txt' ? 'selected' : ''}>Portable TXT</option></select></label><label class="checkbox"><input type="checkbox" id="export-private" ${d.includePrivate ? 'checked' : ''} /> Include private notes</label>${d.format === 'zip' ? `<label class="checkbox"><input type="checkbox" id="export-gallery" ${d.includeGallery ? 'checked' : ''} /> Include gallery media</label><label class="checkbox"><input type="checkbox" id="export-markdown" ${d.includeMarkdown ? 'checked' : ''} /> Include Markdown copy</label><label class="checkbox"><input type="checkbox" id="export-txt" ${d.includeTxt ? 'checked' : ''} /> Include TXT copy</label>` : ''}<div class="dialog-actions"><button data-action="close-export">Cancel</button><button class="primary" data-action="run-export">Export</button></div></section></div>`; }
function preflightDialog() { if (!state.preflight) return ''; const p = state.preflight.summary; return `<div class="modal-backdrop"><section class="create-dialog wide" role="dialog"><div class="dialog-heading"><p class="eyebrow">Restore preflight</p><h2>${p.valid ? 'Review Merge Restore' : 'Invalid Backup'}</h2><p>This restore will merge into your existing library. Existing characters will not be deleted.</p></div>${p.errors?.length ? `<p class="form-error">${escapeHtml(p.errors.join('\n'))}</p>` : ''}<div class="summary-grid"><span>Characters</span><strong>${p.characterCount || 0}</strong><span>Will import</span><strong>${p.importCount || 0}</strong><span>Duplicates skipped</span><strong>${p.skippedDuplicates || 0}</strong><span>ID conflicts as copies</span><strong>${p.conflicts || 0}</strong><span>Media files</span><strong>${p.mediaCount || 0}</strong><span>Missing media</span><strong>${p.missingMedia || 0}</strong><span>Collections</span><strong>${p.collectionCount || 0}</strong></div><div class="dialog-actions"><button data-action="cancel-preflight">Cancel</button>${p.valid ? '<button class="primary" data-action="confirm-restore">Confirm Restore</button>' : ''}</div></section></div>`; }
function importResultDialog() { if (!state.importResult) return ''; const r = state.importResult; return `<div class="modal-backdrop"><section class="create-dialog" role="dialog"><div class="dialog-heading"><p class="eyebrow">Import result</p><h2>Character Card Import</h2></div><div class="summary-grid"><span>Imported characters</span><strong>${r.importedCharacters}</strong><span>Images imported only</span><strong>${r.imagesOnly}</strong><span>Skipped invalid files</span><strong>${r.skippedInvalid}</strong><span>Metadata parse failures</span><strong>${r.parseFailures}</strong><span>Duplicates skipped</span><strong>${r.duplicatesSkipped}</strong></div>${r.messages.length ? `<p class="section-note">${escapeHtml(r.messages.join(' '))}</p>` : ''}<div class="dialog-actions"><button class="primary" data-action="close-import-result">Close</button></div></section></div>`; }

async function render() {
  const app = $('#app');
  app.innerHTML = `<aside class="sidebar"><div class="brand"><span>CK</span><strong>CharacterKeep</strong></div><nav><button class="${state.view === 'characters' && state.filters.collection === 'all' ? 'active' : ''}" data-nav="characters" data-collection="all">All Characters</button><button class="${state.view === 'characters' && state.filters.collection === 'unfiled' ? 'active' : ''}" data-nav="characters" data-collection="unfiled">Unfiled</button><div class="sidebar-section"><div class="sidebar-label"><span>Collections</span><button data-action="new-collection">+</button></div>${state.collections.map((collection) => `<button class="nav-subitem ${state.filters.collection === collection.id ? 'active' : ''}" data-nav="characters" data-collection="${collection.id}">${escapeHtml(collection.name)}</button>`).join('')}</div><button class="${state.view === 'help' ? 'active' : ''}" data-nav="help">Help</button><button class="${state.view === 'settings' ? 'active' : ''}" data-nav="settings">Settings</button></nav></aside>${state.view === 'settings' ? settingsView() : state.view === 'help' ? helpView() : await renderCharactersView()}${state.draft ? await editorView() : ''}${createCharacterDialog()}${exportDialog()}${preflightDialog()}${importResultDialog()}`;
}

function bindEvents() {
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.id === 'search') { state.query = target.value; const cursor = target.selectionStart; render().then(() => { const next = $('#search'); next?.focus(); next?.setSelectionRange(cursor, cursor); }); }
    if (target.dataset.field && state.draft) { state.draft[target.dataset.field] = target.value || (target.dataset.field === 'collectionId' ? null : ''); markDraftDirty(); }
    if (target.dataset.sceneField && state.draft) { const scene = state.draft.scenes.find((item) => item.id === target.dataset.id); if (scene) scene[target.dataset.sceneField] = target.value; markDraftDirty(); }
    if (target.dataset.galleryField && state.draft) { const image = state.draft.gallery.find((item) => item.id === target.dataset.id); if (image) image[target.dataset.galleryField] = target.value; markDraftDirty(); }
    if (target.dataset.createField) { state.createDialog[target.dataset.createField] = target.value; if (target.dataset.createField === 'title' && target.value.trim()) state.createDialog.error = ''; }
  });
  document.addEventListener('change', async (event) => {
    const target = event.target;
    if (target.id === 'sort') { state.sort = target.value; render(); }
    if (target.id === 'tag-filter') { state.filters.tag = target.value; render(); }
    if (target.id === 'model-filter') { state.filters.model = target.value; render(); }
    if (target.id === 'theme-select') { state.settings.theme = target.value; await saveSettings('Theme updated'); render(); }
    if (target.id === 'export-format') { state.exportDialog.format = target.value; render(); }
    if (target.id === 'export-private') state.exportDialog.includePrivate = target.checked;
    if (target.id === 'export-gallery') state.exportDialog.includeGallery = target.checked;
    if (target.id === 'export-markdown') state.exportDialog.includeMarkdown = target.checked;
    if (target.id === 'export-txt') state.exportDialog.includeTxt = target.checked;
    if (target.dataset.selectId) { toggleSelection(target.dataset.selectId, event.shiftKey); render(); }
  });
  document.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape' && state.createDialog.open) return closeCreateDialog();
    if (event.key === 'Escape' && state.exportDialog.open) { state.exportDialog.open = false; return render(); }
    if (event.key === 'Escape' && state.preflight) { state.preflight = null; return render(); }
    if (event.key === 'Enter' && state.createDialog.open && event.target?.id === 'new-character-title') { event.preventDefault(); await createCharacterFromDialog(); return; }
    if (event.key === 'Escape' && state.draft) await closeEditor();
    if (event.key === 'Enter' && event.target.closest('.character-card')) openEditor(event.target.closest('.character-card').dataset.id);
  });
  document.addEventListener('click', async (event) => {
    const select = event.target.closest('[data-select-id]'); if (select) { event.stopPropagation(); return; }
    const button = event.target.closest('button, .character-card, .character-row'); if (!button) return;
    const action = button.dataset.action;
    if (button.dataset.nav) { state.view = button.dataset.nav; if (button.dataset.collection) state.filters.collection = button.dataset.collection; state.selectedIds.clear(); render(); return; }
    if (!action) return; event.stopPropagation();
    if (action === 'create') openCreateDialog();
    if (action === 'create-cancel') closeCreateDialog();
    if (action === 'create-submit') await createCharacterFromDialog();
    if (action === 'open-editor') openEditor(button.dataset.id);
    if (action === 'close-editor') await closeEditor();
    if (action === 'save-draft') await saveDraft();
    if (action === 'copy-system') await copyText((state.draft?.id === button.dataset.id ? state.draft : findCharacter(button.dataset.id))?.systemPrompt || '', 'Copied system prompt');
    if (action === 'copy-full') await copyText(assemblePrompt(state.draft), 'Copied full character prompt');
    if (action === 'duplicate') await duplicateCharacter(button.dataset.id);
    if (action === 'delete') await deleteCharacter(button.dataset.id);
    if (action === 'archive') { const c = findCharacter(button.dataset.id); await archiveCharacter(button.dataset.id, !c?.archived); }
    if (action === 'toggle-filter') { state.filters[button.dataset.filter] = !state.filters[button.dataset.filter]; render(); }
    if (action === 'clear-filters') { state.query = ''; state.filters = { favorite: false, archived: false, tag: '', model: '', gallery: false, scenes: false, collection: 'all' }; render(); }
    if (action === 'view-mode') { state.settings.viewMode = button.dataset.mode; await saveSettings(); render(); }
    if (action === 'toggle-draft-bool') { state.draft[button.dataset.field] = !state.draft[button.dataset.field]; markDraftDirty(); render(); }
    if (action === 'add-chip') addChip(button.dataset.kind, button.closest('.chip-editor').querySelector('input').value);
    if (action === 'remove-chip') removeChip(button.dataset.kind, button.dataset.id);
    if (action === 'add-scene') { state.draft.scenes.push({ id: uid(), title: '', body: '', tags: [], createdAt: nowIso(), updatedAt: nowIso() }); markDraftDirty(); render(); }
    if (action === 'copy-scene') await copyText(state.draft.scenes.find((item) => item.id === button.dataset.id)?.body || '', 'Copied scene');
    if (action === 'duplicate-scene') duplicateScene(button.dataset.id);
    if (action === 'delete-scene') await deleteScene(button.dataset.id);
    if (action === 'add-image') await addImages();
    if (action === 'set-cover') setCover(button.dataset.id);
    if (action === 'remove-image') await removeImage(button.dataset.id);
    if (action === 'lightbox') await showLightbox(button.dataset.id);
    if (action === 'open-data') hasTauri() ? await tauriInvoke('open_data_folder') : toast('Data folder is available in the desktop app');
    if (action === 'backup') await createBackup();
    if (action === 'restore') await restoreBackup();
    if (action === 'confirm-restore') await confirmRestore();
    if (action === 'cancel-preflight') { state.preflight = null; render(); }
    if (action === 'import-card') await importCharacterCards();
    if (action === 'close-import-result') { state.importResult = null; render(); }
    if (action === 'open-export') { state.exportDialog.open = true; render(); }
    if (action === 'close-export') { state.exportDialog.open = false; render(); }
    if (action === 'run-export') await runCharacterExport();
    if (action === 'new-collection') await createCollection();
    if (action === 'rename-collection') await renameCollection(button.dataset.id);
    if (action === 'delete-collection') await deleteCollection(button.dataset.id);
    if (action === 'select-clear') { state.selectedIds.clear(); render(); }
    if (action?.startsWith('bulk-')) await runBulkAction(action);
    if (action === 'kofi') hasTauri() ? await tauriOpenExternal(KO_FI_URL) : window.open(KO_FI_URL, '_blank', 'noopener');
  });
}

function addChip(kind, rawValue) { const name = rawValue.trim(); if (!name) return; const target = kind === 'tags' ? state.draft.tags : state.draft.compatibleModels; if (target.some((item) => item.name.toLowerCase() === name.toLowerCase())) return toast('Already added'); target.push(kind === 'tags' ? { id: uid(), name } : { id: uid(), name, notes: '' }); markDraftDirty(); render(); }
function removeChip(kind, id) { if (kind === 'tags') state.draft.tags = state.draft.tags.filter((item) => item.id !== id); else state.draft.compatibleModels = state.draft.compatibleModels.filter((item) => item.id !== id); markDraftDirty(); render(); }
function duplicateScene(id) { const scene = state.draft.scenes.find((item) => item.id === id); if (scene) state.draft.scenes.push({ ...structuredClone(scene), id: uid(), title: `${scene.title || 'Scene'} Copy`, createdAt: nowIso(), updatedAt: nowIso() }); markDraftDirty(); render(); }
async function deleteScene(id) { if (await confirmAction('Delete this scene?', 'Delete scene')) { state.draft.scenes = state.draft.scenes.filter((scene) => scene.id !== id); markDraftDirty(); render(); } }

async function addImages() {
  if (!hasTauri()) return toast('Image import is available in the desktop app');
  const selected = await tauriDialogOpen({ multiple: true, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] });
  const paths = Array.isArray(selected) ? selected : selected ? [selected] : []; if (!paths.length) return;
  let addedCount = 0; let failedCount = 0;
  for (const path of paths) { const ok = await attachImageToDraft(path); ok ? addedCount += 1 : failedCount += 1; }
  state.imageCache.clear(); if (addedCount) { markDraftDirty(); toast(addedCount === 1 ? 'Image added' : `${addedCount} images added`); } if (failedCount) toast(`${failedCount} images could not be added`, 'danger'); render();
}
async function attachImageToDraft(path) {
  const imageId = uid(); const extension = path.split('.').pop()?.toLowerCase() || 'jpg'; const filename = `${imageId}.${extension}`; const originalPath = `media/characters/${state.draft.id}/originals/${filename}`; const thumbnailPath = `media/characters/${state.draft.id}/thumbnails/${imageId}.jpg`;
  try { await tauriInvoke('copy_image_to_app_data', { sourcePath: path, destFilename: originalPath }); await tauriInvoke('generate_thumbnail', { relativePath: originalPath, thumbnailPath, force: true }).catch(() => toast('Image added without thumbnail')); state.draft.gallery.push({ id: imageId, filename, originalPath, thumbnailPath, caption: '', notes: '', isCover: state.draft.gallery.length === 0, createdAt: nowIso(), updatedAt: nowIso() }); if (!state.draft.previewImageId) state.draft.previewImageId = imageId; return true; } catch (error) { console.error(error); return false; }
}
function setCover(id) { state.draft.previewImageId = id; state.draft.gallery = state.draft.gallery.map((image) => ({ ...image, isCover: image.id === id })); markDraftDirty(); render(); }
async function removeImage(id) { const image = state.draft.gallery.find((item) => item.id === id); if (!image || !(await confirmAction('Remove this gallery image and its local files?', 'Remove image'))) return; if (hasTauri()) for (const relativePath of [image.originalPath, image.thumbnailPath]) if (relativePath) await tauriInvoke('delete_path', { relativePath }).catch(console.warn); state.draft.gallery = state.draft.gallery.filter((item) => item.id !== id); if (state.draft.previewImageId === id) state.draft.previewImageId = state.draft.gallery[0]?.id || null; state.imageCache.clear(); markDraftDirty(); toast('Image removed'); render(); }
async function showLightbox(id) { const image = state.draft.gallery.find((item) => item.id === id); const url = await loadImage(image?.originalPath || image?.thumbnailPath); if (!url) return; const overlay = document.createElement('div'); overlay.className = 'lightbox'; overlay.innerHTML = `<button>×</button><img src="${url}" alt="${escapeHtml(image.caption || state.draft.title)}" />`; overlay.addEventListener('click', () => overlay.remove()); document.body.appendChild(overlay); }

function mapCharacterCard(card, sourcePath, metadata) {
  const data = card?.data && typeof card.data === 'object' ? card.data : card;
  const title = [data?.name, card?.name, data?.title, card?.title, data?.nickname].find((v) => typeof v === 'string' && v.trim())?.trim();
  if (!title) return null;
  const character = defaultCharacter(title);
  const description = data.description || data.summary || data.subtitle || '';
  if (typeof description === 'string' && description.trim().length <= 180) character.subtitle = description.trim(); else if (description) character.notes = String(description).trim();
  const promptParts = [['Personality', data.personality], ['Scenario', data.scenario], ['System Prompt', data.system_prompt], ['Post History Instructions', data.post_history_instructions]].filter(([, v]) => v).map(([k, v]) => `## ${k}\n${Array.isArray(v) ? v.join('\n') : v}`);
  character.systemPrompt = promptParts.join('\n\n');
  character.authorsNote = [data.creator_notes, data.creator_notes_multilingual].filter(Boolean).map((v) => typeof v === 'string' ? v : JSON.stringify(v, null, 2)).join('\n\n');
  if (!character.notes && data.creator_notes) character.notes = String(data.creator_notes);
  const greetings = [data.first_mes, ...(Array.isArray(data.alternate_greetings) ? data.alternate_greetings : [])].filter(Boolean);
  character.scenes = greetings.map((body, index) => ({ id: uid(), title: index === 0 ? 'First Message' : `Alternate Greeting ${index}`, body: String(body), tags: [], createdAt: nowIso(), updatedAt: nowIso() }));
  character.tags = normalizeNamedArray(Array.isArray(data.tags) ? data.tags : []);
  character.extensions.characterkeep.importSource = { sourceFormat: metadata.chunkKeyword || 'character-card-png', sourcePath: sourcePath.split('/').pop(), rawMetadata: card };
  return character;
}

async function importCharacterCards() {
  if (!hasTauri()) return toast('Character card import is available in the desktop app');
  const selected = await tauriDialogOpen({ multiple: true, filters: [{ name: 'PNG Character Cards', extensions: ['png'] }] });
  const paths = Array.isArray(selected) ? selected : selected ? [selected] : []; if (!paths.length) return;
  const result = { importedCharacters: 0, imagesOnly: 0, skippedInvalid: 0, parseFailures: 0, duplicatesSkipped: 0, messages: [] };
  const existingHashes = new Set(state.characters.map((c) => `${c.title.toLowerCase()}|${c.systemPrompt.slice(0, 200)}`));
  for (const path of paths) {
    try {
      const metadata = await tauriInvoke('extract_character_card_from_path', { absolutePath: path });
      if (!metadata.found) { metadata.error ? result.parseFailures++ : result.skippedInvalid++; continue; }
      const character = mapCharacterCard(metadata.cardData, path, metadata); if (!character) { result.skippedInvalid++; continue; }
      const hash = `${character.title.toLowerCase()}|${character.systemPrompt.slice(0, 200)}`; if (existingHashes.has(hash)) { result.duplicatesSkipped++; continue; }
      const imageId = uid(); const originalPath = `media/characters/${character.id}/originals/${imageId}.png`; const thumbnailPath = `media/characters/${character.id}/thumbnails/${imageId}.jpg`;
      await tauriInvoke('copy_image_to_app_data', { sourcePath: path, destFilename: originalPath }); await tauriInvoke('generate_thumbnail', { relativePath: originalPath, thumbnailPath, force: true }).catch(() => undefined);
      character.gallery.push({ id: imageId, filename: `${imageId}.png`, originalPath, thumbnailPath, caption: 'Imported character card', notes: '', isCover: true, createdAt: nowIso(), updatedAt: nowIso() }); character.previewImageId = imageId;
      state.characters.unshift(normalizeCharacter(character)); existingHashes.add(hash); result.importedCharacters++;
    } catch (error) { console.error(error); result.parseFailures++; }
  }
  await saveCharacters(); state.imageCache.clear(); state.importResult = result; render();
}

async function createBackup() { if (!hasTauri()) return toast('Backup is available in the desktop app'); const dest = await tauriDialogSave({ defaultPath: `characterkeep-backup-${dateSlug()}.zip`, filters: [{ name: 'ZIP Archive', extensions: ['zip'] }] }); if (!dest) return; await saveCharacters(); await saveCollections(); await saveSettings(); await tauriInvoke('create_characterkeep_backup_zip', { destPath: dest }); toast('Backup created'); }
async function restoreBackup() { if (!hasTauri()) return toast('Restore is available in the desktop app'); const source = await tauriDialogOpen({ multiple: false, filters: [{ name: 'ZIP Archive', extensions: ['zip'] }] }); if (!source) return; const summary = await tauriInvoke('preflight_characterkeep_backup_zip', { sourcePath: source }); state.preflight = { source, summary }; render(); }
async function confirmRestore() { const source = state.preflight?.source; if (!source) return; const summary = await tauriInvoke('restore_characterkeep_backup_zip', { sourcePath: source }); state.characters = (await readJson(DATA_FILE, [])).map(normalizeCharacter); state.collections = (await readJson(COLLECTIONS_FILE, [])).map(normalizeCollection); state.preflight = null; state.imageCache.clear(); toast(`Restore completed: imported ${summary.imported}, skipped ${summary.skipped}, conflicts ${summary.conflicts}`); render(); }

async function runCharacterExport() {
  if (!state.draft) return; if (state.dirty && !(await saveDraft())) return; if (!hasTauri()) return toast('Export is available in the desktop app');
  const character = findCharacter(state.draft.id) || state.draft; const slug = safeSlug(character.title); const stamp = timestampSlug(); const d = state.exportDialog;
  const ext = d.format === 'markdown' ? 'md' : d.format === 'txt' ? 'txt' : 'zip'; const defaultPath = d.format === 'zip' ? `${slug}-characterkeep-backup-${stamp}.zip` : `${slug}-portable-${stamp}.${ext}`;
  const dest = await tauriDialogSave({ defaultPath, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] }); if (!dest) return;
  if (d.format === 'markdown') await tauriInvoke('write_export_text_file', { destPath: dest, content: characterMarkdown(character, d.includePrivate) });
  else if (d.format === 'txt') await tauriInvoke('write_export_text_file', { destPath: dest, content: characterTxt(character, d.includePrivate) });
  else await tauriInvoke('export_characterkeep_character_zip', { destPath: dest, character, collection: collectionById(character.collectionId) || null, includeGalleryMedia: d.includeGallery, markdown: d.includeMarkdown ? characterMarkdown(character, d.includePrivate) : null, text: d.includeTxt ? characterTxt(character, d.includePrivate) : null });
  state.exportDialog.open = false; toast('Character exported'); render();
}

async function createCollection() { const name = window.prompt('Collection name'); if (!name?.trim()) return; const collection = defaultCollection(name.trim()); state.collections.push(collection); await saveCollections('Collection created'); state.filters.collection = collection.id; state.view = 'characters'; render(); }
async function renameCollection(id) { const collection = collectionById(id); if (!collection) return; const name = window.prompt('Rename collection', collection.name); if (!name?.trim()) return; collection.name = name.trim(); collection.updatedAt = nowIso(); await saveCollections('Collection renamed'); render(); }
async function deleteCollection(id) { const collection = collectionById(id); if (!collection || !(await confirmAction(`Delete collection "${collection.name}"? Characters will move to Unfiled.`, 'Delete collection'))) return; state.collections = state.collections.filter((item) => item.id !== id); state.characters = state.characters.map((character) => character.collectionId === id ? { ...character, collectionId: null, updatedAt: nowIso() } : character); if (state.filters.collection === id) state.filters.collection = 'all'; await saveCollections(); await saveCharacters('Collection deleted'); render(); }

function toggleSelection(id, shiftKey = false) { const items = filteredCharacters(); if (shiftKey && state.lastSelectedId) { const a = items.findIndex((item) => item.id === state.lastSelectedId); const b = items.findIndex((item) => item.id === id); if (a >= 0 && b >= 0) items.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((item) => state.selectedIds.add(item.id)); } else if (state.selectedIds.has(id)) state.selectedIds.delete(id); else state.selectedIds.add(id); state.lastSelectedId = id; }
async function runBulkAction(action) {
  const ids = [...state.selectedIds]; if (!ids.length) return;
  if (action === 'bulk-delete') { if (!(await confirmAction(`Permanently delete ${ids.length} characters and their local gallery files? This cannot be undone.`, 'Bulk delete'))) return; for (const id of ids) if (hasTauri()) await tauriInvoke('delete_path', { relativePath: `media/characters/${id}` }).catch(console.warn); state.characters = state.characters.filter((character) => !state.selectedIds.has(character.id)); state.selectedIds.clear(); await saveCharacters('Characters deleted'); return render(); }
  if (action === 'bulk-tag') { const tag = window.prompt('Tag to add'); if (!tag?.trim()) return; state.characters = state.characters.map((c) => ids.includes(c.id) && !c.tags.some((t) => t.name.toLowerCase() === tag.trim().toLowerCase()) ? { ...c, tags: [...c.tags, { id: uid(), name: tag.trim() }], updatedAt: nowIso() } : c); }
  if (action === 'bulk-move') { const name = window.prompt(`Move to collection name, or leave blank for Unfiled:\n${state.collections.map((c) => c.name).join(', ')}`); const collectionId = name?.trim() ? state.collections.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())?.id : null; if (name?.trim() && !collectionId) return toast('Collection not found', 'danger'); state.characters = state.characters.map((c) => ids.includes(c.id) ? { ...c, collectionId, updatedAt: nowIso() } : c); }
  if (action === 'bulk-archive') state.characters = state.characters.map((c) => ids.includes(c.id) ? { ...c, archived: true, updatedAt: nowIso() } : c);
  if (action === 'bulk-unarchive') state.characters = state.characters.map((c) => ids.includes(c.id) ? { ...c, archived: false, updatedAt: nowIso() } : c);
  if (action === 'bulk-favorite') state.characters = state.characters.map((c) => ids.includes(c.id) ? { ...c, favorite: true, updatedAt: nowIso() } : c);
  if (action === 'bulk-unfavorite') state.characters = state.characters.map((c) => ids.includes(c.id) ? { ...c, favorite: false, updatedAt: nowIso() } : c);
  await saveCharacters('Bulk action applied'); render();
}

async function init() {
  state.characters = (await readJson(DATA_FILE, [])).map(normalizeCharacter);
  state.collections = (await readJson(COLLECTIONS_FILE, [])).map(normalizeCollection);
  const knownCollections = new Set(state.collections.map((collection) => collection.id));
  state.characters = state.characters.map((character) => knownCollections.has(character.collectionId) ? character : { ...character, collectionId: null });
  state.settings = normalizeSettings(await readJson(SETTINGS_FILE, {}));
  if (hasTauri()) state.dataPath = await tauriInvoke('get_app_data_path').catch(() => '');
  applyTheme(); bindEvents(); await render();
}

init().catch((error) => { console.error(error); $('#app').innerHTML = `<main class="fatal"><h1>CharacterKeep could not start</h1><p>${escapeHtml(error.message || error)}</p></main>`; });
