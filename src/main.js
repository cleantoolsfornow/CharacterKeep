import {
  hasTauri,
  tauriDialogConfirm,
  tauriDialogOpen,
  tauriDialogSave,
  tauriInvoke,
  tauriOpenExternal
} from './tauriBridge.js';

const DATA_FILE = 'data/characters.json';
const SETTINGS_FILE = 'data/settings.json';
const KO_FI_URL = 'https://ko-fi.com/cleantoolsfornow';

const state = {
  view: 'characters',
  characters: [],
  settings: { theme: 'system' },
  query: '',
  filters: { favorite: false, archived: false, tag: '', model: '', gallery: false, scenes: false },
  sort: 'updated',
  selectedId: null,
  draft: null,
  dirty: false,
  saveStatus: 'saved',
  createDialog: { open: false, title: '', subtitle: '', error: '' },
  imageCache: new Map(),
  dataPath: ''
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const nowIso = () => new Date().toISOString();
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

function defaultCharacter(title = 'Untitled Character') {
  const now = nowIso();
  return {
    id: uid(),
    schemaVersion: 1,
    type: 'roleplay_character',
    title,
    subtitle: '',
    previewImageId: null,
    systemPrompt: '',
    authorsNote: '',
    notes: '',
    scenes: [],
    tags: [],
    compatibleModels: [],
    settingsNotes: '',
    gallery: [],
    favorite: false,
    archived: false,
    extensions: { characterkeep: {} },
    createdAt: now,
    updatedAt: now
  };
}

function toast(message, tone = 'default') {
  const region = $('#toast-region');
  const node = document.createElement('div');
  node.className = `toast ${tone}`;
  node.textContent = message;
  region.appendChild(node);
  setTimeout(() => node.classList.add('visible'), 20);
  setTimeout(() => {
    node.classList.remove('visible');
    setTimeout(() => node.remove(), 220);
  }, 2800);
}

async function confirmAction(message, title = 'Confirm') {
  if (hasTauri()) {
    return tauriDialogConfirm(message, { title, kind: 'warning' });
  }
  return window.confirm(`${title}\n\n${message}`);
}

function setSaveStatus(status) {
  state.saveStatus = status;
  const node = $('.save-status');
  if (node) {
    node.textContent = saveStatusText();
    node.dataset.status = state.saveStatus;
  }
}

function saveStatusText() {
  if (state.saveStatus === 'saving') return 'Saving...';
  if (state.saveStatus === 'failed') return 'Save failed';
  if (state.saveStatus === 'unsaved') return 'Unsaved changes';
  return 'Saved';
}

function markDraftDirty() {
  state.dirty = true;
  setSaveStatus('unsaved');
}

async function readJson(path, fallback) {
  if (!hasTauri()) {
    const raw = localStorage.getItem(`characterkeep:${path}`);
    return raw ? JSON.parse(raw) : fallback;
  }
  try {
    return JSON.parse(await tauriInvoke('read_json_file', { filename: path }));
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  if (!hasTauri()) {
    localStorage.setItem(`characterkeep:${path}`, JSON.stringify(value));
    return;
  }
  await tauriInvoke('write_json_file', { filename: path, content: JSON.stringify(value, null, 2) });
}

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

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme || 'system';
}

async function saveAll(message) {
  await writeJson(DATA_FILE, state.characters);
  if (message) toast(message);
}

async function persistCharacters(nextCharacters, message) {
  await writeJson(DATA_FILE, nextCharacters);
  state.characters = nextCharacters;
  if (message) toast(message);
}

async function saveSettings() {
  await writeJson(SETTINGS_FILE, state.settings);
  applyTheme();
}

function normalizeCharacter(character) {
  return {
    ...defaultCharacter(character?.title || 'Untitled Character'),
    ...character,
    gallery: Array.isArray(character?.gallery) ? character.gallery : [],
    scenes: Array.isArray(character?.scenes) ? character.scenes : [],
    tags: Array.isArray(character?.tags) ? character.tags : [],
    compatibleModels: Array.isArray(character?.compatibleModels) ? character.compatibleModels : [],
    extensions: character?.extensions || { characterkeep: {} }
  };
}

function allTags() {
  return [...new Set(state.characters.flatMap((character) => character.tags.map((tag) => tag.name)).filter(Boolean))].sort();
}

function allModels() {
  return [...new Set(state.characters.flatMap((character) => character.compatibleModels.map((model) => model.name)).filter(Boolean))].sort();
}

function searchableText(character) {
  return [
    character.title,
    character.subtitle,
    character.systemPrompt,
    character.authorsNote,
    character.notes,
    character.settingsNotes,
    ...character.scenes.flatMap((scene) => [scene.title, scene.body, ...(scene.tags || []).map((tag) => tag.name || tag)]),
    ...character.tags.map((tag) => tag.name),
    ...character.compatibleModels.flatMap((model) => [model.name, model.notes])
  ].join(' ').toLowerCase();
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
    return !query || searchableText(character).includes(query);
  });

  items = items.sort((a, b) => {
    if (state.sort === 'az') return a.title.localeCompare(b.title);
    if (state.sort === 'za') return b.title.localeCompare(a.title);
    if (state.sort === 'created') return new Date(b.createdAt) - new Date(a.createdAt);
    if (state.sort === 'favorite') return Number(b.favorite) - Number(a.favorite) || new Date(b.updatedAt) - new Date(a.updatedAt);
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
  return items;
}

function formatDate(value) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function assemblePrompt(character) {
  const scenes = character.scenes
    .filter((scene) => scene.title || scene.body)
    .map((scene) => `### ${scene.title || 'Starter Scene'}\n${scene.body || ''}`)
    .join('\n\n');
  return [
    `# Character: ${character.title}`,
    character.systemPrompt && `## System Prompt\n${character.systemPrompt}`,
    character.authorsNote && `## Author's Note\n${character.authorsNote}`,
    scenes && `## Scene / Starter\n${scenes}`,
    character.settingsNotes && `## Settings Notes\n${character.settingsNotes}`
  ].filter(Boolean).join('\n\n');
}

async function copyText(text, message) {
  await navigator.clipboard.writeText(text || '');
  toast(message);
}

function openCreateDialog() {
  state.createDialog = { open: true, title: '', subtitle: '', error: '' };
  render().then(() => $('#new-character-title')?.focus());
}

function closeCreateDialog() {
  state.createDialog = { open: false, title: '', subtitle: '', error: '' };
  render();
}

async function createCharacterFromDialog() {
  const title = state.createDialog.title.trim();
  const subtitle = state.createDialog.subtitle.trim();
  if (!title) {
    state.createDialog.error = 'Title is required.';
    render().then(() => $('#new-character-title')?.focus());
    return;
  }
  const character = { ...defaultCharacter(title), subtitle };
  const nextCharacters = [character, ...state.characters];
  await persistCharacters(nextCharacters, 'Character created');
  state.createDialog = { open: false, title: '', subtitle: '', error: '' };
  openEditor(character.id);
}

function findCharacter(id) {
  return state.characters.find((character) => character.id === id);
}

function openEditor(id) {
  state.selectedId = id;
  state.draft = structuredClone(findCharacter(id));
  state.dirty = false;
  state.saveStatus = 'saved';
  render();
}

async function closeEditor() {
  if (state.dirty) {
    const ok = await confirmAction('Discard unsaved changes for this character?', 'Unsaved changes');
    if (!ok) return;
  }
  state.selectedId = null;
  state.draft = null;
  state.dirty = false;
  state.saveStatus = 'saved';
  render();
}

async function saveDraft() {
  const title = state.draft.title.trim();
  if (!title) {
    toast('Title is required', 'danger');
    return false;
  }
  setSaveStatus('saving');
  try {
    const savedDraft = { ...structuredClone(state.draft), title, updatedAt: nowIso() };
    const index = state.characters.findIndex((character) => character.id === state.draft.id);
    if (index < 0) throw new Error('Character no longer exists');
    const nextCharacters = state.characters.map((character, currentIndex) => (
      currentIndex === index ? savedDraft : character
    ));
    await persistCharacters(nextCharacters, 'Character saved');
    state.draft = structuredClone(savedDraft);
    state.dirty = false;
    setSaveStatus('saved');
    render();
    return true;
  } catch (error) {
    console.error('Could not save character', error);
    state.dirty = true;
    setSaveStatus('failed');
    toast('Could not save character. Your existing data was not changed.', 'danger');
    return false;
  }
}

function duplicatePath(path, oldId, newId, newImageId) {
  return path?.replace(`media/characters/${oldId}/`, `media/characters/${newId}/`)?.replace(/\/([^/]+)$/, `/${newImageId}.jpg`) || '';
}

async function duplicateCharacter(id) {
  const original = findCharacter(id);
  if (!original) return;
  const oldId = original.id;
  const newId = uid();
  const now = nowIso();
  const imageCopies = [];
  const gallery = original.gallery.map((image) => {
    const imageId = uid();
    const extension = image.filename?.split('.').pop() || 'jpg';
    const originalPath = `media/characters/${newId}/originals/${imageId}.${extension}`;
    const thumbnailPath = `media/characters/${newId}/thumbnails/${imageId}.jpg`;
    if (image.originalPath) imageCopies.push([image.originalPath, originalPath]);
    if (image.thumbnailPath) imageCopies.push([image.thumbnailPath, thumbnailPath]);
    return { ...image, id: imageId, originalPath, thumbnailPath, createdAt: now, updatedAt: now };
  });
  const duplicate = {
    ...structuredClone(original),
    id: newId,
    title: `${original.title} Copy`,
    scenes: original.scenes.map((scene) => ({ ...scene, id: uid(), createdAt: now, updatedAt: now })),
    tags: original.tags.map((tag) => ({ ...tag, id: uid() })),
    compatibleModels: original.compatibleModels.map((model) => ({ ...model, id: uid() })),
    gallery,
    previewImageId: original.previewImageId ? gallery.find((image) => image.isCover)?.id || gallery[0]?.id || null : null,
    createdAt: now,
    updatedAt: now
  };
  if (hasTauri()) {
    for (const [sourceRelativePath, destRelativePath] of imageCopies) {
      try {
        await tauriInvoke('copy_app_data_file', { sourceRelativePath, destRelativePath });
      } catch (error) {
        console.warn('Could not copy gallery file while duplicating', error);
      }
    }
  }
  state.characters.unshift(duplicate);
  await saveAll('Character duplicated');
}

async function archiveCharacter(id, archived = true) {
  const character = findCharacter(id);
  if (!character) return;
  character.archived = archived;
  character.updatedAt = nowIso();
  await saveAll(archived ? 'Character archived' : 'Character restored');
  render();
}

async function deleteCharacter(id) {
  const character = findCharacter(id);
  if (!character) return;
  const ok = await confirmAction(`This will permanently remove "${character.title}" and all local gallery files stored for it. This cannot be undone.\n\nFor safer cleanup, archive characters from the card grid and only delete permanently from this editor.`, `Permanently delete "${character.title}"?`);
  if (!ok) return;
  state.characters = state.characters.filter((item) => item.id !== id);
  if (hasTauri()) {
    try {
      await tauriInvoke('delete_path', { relativePath: `media/characters/${id}` });
    } catch (error) {
      console.warn('Could not remove character media', error);
    }
  }
  if (state.selectedId === id) {
    state.selectedId = null;
    state.draft = null;
    state.dirty = false;
    state.saveStatus = 'saved';
  }
  await saveAll('Character deleted');
  render();
}

function chipMarkup(items, className = '') {
  return items.map((item) => `<span class="chip ${className}">${escapeHtml(item.name || item)}</span>`).join('');
}

async function renderCards() {
  const items = filteredCharacters();
  const cards = await Promise.all(items.map(async (character) => {
    const cover = character.gallery.find((image) => image.id === character.previewImageId || image.isCover) || character.gallery[0];
    const imageUrl = await loadImage(cover?.thumbnailPath || cover?.originalPath);
    const hasBrokenCover = cover && !imageUrl;
    return `
      <article class="character-card" data-action="open-editor" data-id="${character.id}" tabindex="0">
        <div class="card-art ${imageUrl ? 'has-image' : ''} ${hasBrokenCover ? 'missing-image' : ''}">
          ${imageUrl ? `<img src="${imageUrl}" alt="" />` : `<div class="placeholder"><span>${escapeHtml(character.title.slice(0, 1).toUpperCase() || 'C')}</span>${hasBrokenCover ? '<small>Image missing</small>' : ''}</div>`}
          ${character.favorite ? '<span class="favorite-badge" aria-label="Favorite">★</span>' : ''}
        </div>
        <div class="card-body">
          <div class="card-title-row">
            <h3>${escapeHtml(character.title)}</h3>
            <span>${formatDate(character.updatedAt)}</span>
          </div>
          ${character.subtitle ? `<p>${escapeHtml(character.subtitle)}</p>` : '<p class="muted">No subtitle yet</p>'}
          <div class="chip-row">${chipMarkup(character.tags.slice(0, 4))}${chipMarkup(character.compatibleModels.slice(0, 3), 'model-chip')}</div>
          <div class="card-meta">
            <span>${character.scenes.length} scenes</span>
            <span>${character.gallery.length} images</span>
          </div>
          <div class="card-actions">
            <button class="card-action-button" data-action="copy-system" data-id="${character.id}" title="Copy system prompt" aria-label="Copy system prompt"><span>⧉</span><em>Copy</em></button>
            <button class="card-action-button" data-action="duplicate" data-id="${character.id}" title="Duplicate character" aria-label="Duplicate character"><span>⎘</span><em>Duplicate</em></button>
            <button class="card-action-button quiet" data-action="archive" data-id="${character.id}" title="${character.archived ? 'Restore character' : 'Archive character'}" aria-label="${character.archived ? 'Restore character' : 'Archive character'}"><span>${character.archived ? '↥' : '↓'}</span><em>${character.archived ? 'Restore' : 'Archive'}</em></button>
          </div>
        </div>
      </article>
    `;
  }));

  if (!state.characters.length) {
    return `
      <section class="empty-state">
        <div class="empty-mark">CK</div>
        <h2>No characters yet</h2>
        <p>Create your first roleplay character and keep everything private on your device.</p>
        <ul class="empty-help">
          <li>Only the title is required.</li>
          <li>Prompts, notes, scenes, and tags stay local.</li>
          <li>Images are copied into CharacterKeep's app data folder.</li>
        </ul>
        <button class="primary" data-action="create">Create Character</button>
      </section>
    `;
  }
  if (!items.length) {
    return `<section class="empty-state"><h2>No matching characters</h2><p>Try changing your search or clearing filters.</p><button data-action="clear-filters">Clear Filters</button></section>`;
  }
  return `<section class="grid">${cards.join('')}</section>`;
}

async function renderCharactersView() {
  return `
    <main class="content">
      <header class="topbar">
        <div>
          <p class="eyebrow">Private local vault</p>
          <h1>Characters</h1>
        </div>
        <button class="primary" data-action="create">New Character</button>
      </header>
      <section class="toolbar">
        <input id="search" type="search" placeholder="Search characters, scenes, tags, models..." value="${escapeHtml(state.query)}" />
        <select id="sort">
          <option value="updated" ${state.sort === 'updated' ? 'selected' : ''}>Recently edited</option>
          <option value="created" ${state.sort === 'created' ? 'selected' : ''}>Recently created</option>
          <option value="az" ${state.sort === 'az' ? 'selected' : ''}>A-Z</option>
          <option value="za" ${state.sort === 'za' ? 'selected' : ''}>Z-A</option>
          <option value="favorite" ${state.sort === 'favorite' ? 'selected' : ''}>Favorites first</option>
        </select>
        <button class="${state.filters.favorite ? 'active' : ''}" data-action="toggle-filter" data-filter="favorite">Favorites</button>
        <button class="${state.filters.archived ? 'active' : ''}" data-action="toggle-filter" data-filter="archived">Archived</button>
        <button class="${state.filters.gallery ? 'active' : ''}" data-action="toggle-filter" data-filter="gallery">Has gallery</button>
        <button class="${state.filters.scenes ? 'active' : ''}" data-action="toggle-filter" data-filter="scenes">Has scenes</button>
        <select id="tag-filter"><option value="">All tags</option>${allTags().map((tag) => `<option ${state.filters.tag === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`)}</select>
        <select id="model-filter"><option value="">All models</option>${allModels().map((model) => `<option ${state.filters.model === model ? 'selected' : ''}>${escapeHtml(model)}</option>`)}</select>
      </section>
      ${await renderCards()}
    </main>
  `;
}

function settingsView() {
  return `
    <main class="content">
      <header class="topbar">
        <div><p class="eyebrow">Local-first</p><h1>Settings</h1></div>
      </header>
      <section class="settings-grid">
        <div class="panel">
          <h2>Appearance</h2>
          <label>Theme
            <select id="theme-select">
              <option value="system" ${state.settings.theme === 'system' ? 'selected' : ''}>System</option>
              <option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>Light</option>
              <option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
            </select>
          </label>
        </div>
        <div class="panel">
          <h2>Data</h2>
          <p class="data-path">${escapeHtml(state.dataPath || 'Available in the desktop app')}</p>
          <div class="button-row">
            <button data-action="open-data">Open Data Folder</button>
            <button data-action="backup">Create Full Backup</button>
            <button data-action="restore">Restore From Backup</button>
          </div>
        </div>
        <div class="panel">
          <h2>Privacy</h2>
          <p>CharacterKeep stores your data locally on your device. It does not upload your characters, prompts, images, or notes anywhere.</p>
        </div>
        <div class="panel">
          <h2>Support</h2>
          <button data-action="kofi">Support development on Ko-fi</button>
        </div>
      </section>
    </main>
  `;
}

function editorSection(title, body, className = '') {
  return `<section class="editor-section ${className}"><h2>${title}</h2>${body}</section>`;
}

function renderChipEditor(kind, items) {
  return `
    <div class="chip-editor" data-kind="${kind}">
      <div class="chip-row">${items.map((item) => `<span class="chip">${escapeHtml(item.name)} <button data-action="remove-chip" data-kind="${kind}" data-id="${item.id}" aria-label="Remove ${escapeHtml(item.name)}">×</button></span>`).join('')}</div>
      <div class="inline-add">
        <input placeholder="${kind === 'tags' ? 'Add tag' : 'Add model'}" data-kind="${kind}" />
        <button data-action="add-chip" data-kind="${kind}">Add</button>
      </div>
    </div>
  `;
}

async function editorView() {
  const c = state.draft;
  if (!c) return '';
  const cover = c.gallery.find((image) => image.id === c.previewImageId || image.isCover) || c.gallery[0];
  const coverUrl = await loadImage(cover?.thumbnailPath || cover?.originalPath);
  const hasBrokenCover = cover && !coverUrl;
  const gallery = await Promise.all(c.gallery.map(async (image) => {
    const url = await loadImage(image.thumbnailPath || image.originalPath);
    const missing = !url;
    return `
      <article class="gallery-item ${missing ? 'is-missing' : ''}">
        <button class="gallery-thumb" data-action="lightbox" data-id="${image.id}" ${missing ? 'disabled' : ''}>${url ? `<img src="${url}" alt="${escapeHtml(image.caption || c.title)}" />` : '<span>Image missing</span>'}</button>
        <input value="${escapeHtml(image.caption || '')}" data-gallery-field="caption" data-id="${image.id}" placeholder="Caption" />
        <textarea data-gallery-field="notes" data-id="${image.id}" placeholder="Image notes">${escapeHtml(image.notes || '')}</textarea>
        <div class="button-row">
          <button data-action="set-cover" data-id="${image.id}">${image.id === c.previewImageId || image.isCover ? 'Cover' : 'Set cover'}</button>
          <button class="danger" data-action="remove-image" data-id="${image.id}">Remove</button>
        </div>
      </article>
    `;
  }));

  return `
    <div class="editor-backdrop">
      <main class="editor-shell" role="dialog" aria-modal="true" aria-label="Character editor">
        <header class="editor-header">
          <div class="editor-avatar ${hasBrokenCover ? 'missing-image' : ''}">${coverUrl ? `<img src="${coverUrl}" alt="" />` : `<span>${escapeHtml(c.title.slice(0, 1).toUpperCase() || 'C')}</span>`}</div>
          <div class="editor-title-fields">
            <input class="title-input" value="${escapeHtml(c.title)}" data-field="title" aria-label="Title" />
            <input class="subtitle-input" value="${escapeHtml(c.subtitle)}" data-field="subtitle" placeholder="Subtitle or short description" aria-label="Subtitle" />
            <span class="save-status" data-status="${state.saveStatus}">${saveStatusText()}</span>
          </div>
          <div class="editor-actions">
            <button class="${c.favorite ? 'active' : ''}" data-action="toggle-draft-bool" data-field="favorite">★</button>
            <button data-action="copy-full">Copy Full</button>
            <button data-action="save-draft" class="primary">Save</button>
            <button data-action="duplicate" data-id="${c.id}">Duplicate</button>
            <button data-action="toggle-draft-bool" data-field="archived">${c.archived ? 'Unarchive' : 'Archive'}</button>
            <button class="danger" data-action="delete" data-id="${c.id}">Delete</button>
            <button data-action="close-editor" aria-label="Close editor">×</button>
          </div>
        </header>
        <div class="editor-grid">
          <div class="editor-column">
            ${editorSection('Overview', `
              <label>Tags${renderChipEditor('tags', c.tags)}</label>
              <label>Best compatible with${renderChipEditor('models', c.compatibleModels)}</label>
              <p class="section-note">${c.archived ? 'Archived characters are hidden from the default grid.' : 'Archive from the header to hide this character without deleting local files.'}</p>
            `)}
            ${editorSection('Scenes', `
              <div class="scene-list">
                ${c.scenes.map((scene) => `
                  <article class="scene" data-id="${scene.id}">
                    <input value="${escapeHtml(scene.title)}" data-scene-field="title" data-id="${scene.id}" placeholder="Scene title" />
                    <textarea data-scene-field="body" data-id="${scene.id}" placeholder="Starter scene">${escapeHtml(scene.body)}</textarea>
                    <div class="button-row">
                      <button data-action="copy-scene" data-id="${scene.id}">Copy</button>
                      <button data-action="duplicate-scene" data-id="${scene.id}">Duplicate</button>
                      <button class="danger" data-action="delete-scene" data-id="${scene.id}">Delete</button>
                    </div>
                  </article>
                `).join('')}
              </div>
              <button data-action="add-scene">Add Scene</button>
            `, 'scenes-section')}
            ${editorSection('Notes', `
              <label>Private Notes<textarea class="medium" data-field="notes">${escapeHtml(c.notes)}</textarea></label>
              <label>Settings Notes<textarea class="medium" data-field="settingsNotes">${escapeHtml(c.settingsNotes)}</textarea></label>
            `, 'notes-section')}
          </div>
          <div class="editor-column">
            ${editorSection('Prompt', `
              <label>System Prompt<textarea class="large" data-field="systemPrompt">${escapeHtml(c.systemPrompt)}</textarea></label>
              <label>Author's Note<textarea class="medium" data-field="authorsNote">${escapeHtml(c.authorsNote)}</textarea></label>
              <button data-action="copy-system" data-id="${c.id}">Copy System Prompt</button>
            `, 'prompt-section')}
            ${editorSection('Gallery', `
              <div class="button-row"><button data-action="add-image">Add Images</button></div>
              <div class="gallery-grid">${gallery.join('')}</div>
            `)}
          </div>
        </div>
      </main>
    </div>
  `;
}

function createCharacterDialog() {
  if (!state.createDialog.open) return '';
  return `
    <div class="modal-backdrop" data-action="create-cancel">
      <section class="create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-dialog-title">
        <div class="dialog-heading">
          <p class="eyebrow">New character</p>
          <h2 id="create-dialog-title">Create Character</h2>
          <p>Start with the name. Everything else can be filled in once the editor opens.</p>
        </div>
        <label><span class="field-label">Title</span>
          <input id="new-character-title" data-create-field="title" value="${escapeHtml(state.createDialog.title)}" placeholder="Character name" aria-invalid="${state.createDialog.error ? 'true' : 'false'}" />
        </label>
        <label><span class="field-label">Subtitle <span class="optional">Optional</span></span>
          <input data-create-field="subtitle" value="${escapeHtml(state.createDialog.subtitle)}" placeholder="Short description or role" />
        </label>
        ${state.createDialog.error ? `<p class="form-error">${escapeHtml(state.createDialog.error)}</p>` : ''}
        <div class="dialog-actions">
          <button data-action="create-cancel">Cancel</button>
          <button class="primary" data-action="create-submit">Create Character</button>
        </div>
      </section>
    </div>
  `;
}

async function render() {
  const app = $('#app');
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand"><span>CK</span><strong>CharacterKeep</strong></div>
      <nav>
        <button class="${state.view === 'characters' ? 'active' : ''}" data-nav="characters">Characters</button>
        <button class="${state.view === 'settings' ? 'active' : ''}" data-nav="settings">Settings</button>
      </nav>
    </aside>
    ${state.view === 'settings' ? settingsView() : await renderCharactersView()}
    ${state.draft ? await editorView() : ''}
    ${createCharacterDialog()}
  `;
}

function bindEvents() {
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.id === 'search') {
      state.query = target.value;
      const cursor = target.selectionStart;
      render().then(() => {
        const next = $('#search');
        next?.focus();
        next?.setSelectionRange(cursor, cursor);
      });
    }
    if (target.dataset.field && state.draft) {
      if (target.type === 'checkbox') state.draft[target.dataset.field] = target.checked;
      else state.draft[target.dataset.field] = target.value;
      markDraftDirty();
    }
    if (target.dataset.sceneField && state.draft) {
      const scene = state.draft.scenes.find((item) => item.id === target.dataset.id);
      if (scene) scene[target.dataset.sceneField] = target.value;
      markDraftDirty();
    }
    if (target.dataset.galleryField && state.draft) {
      const image = state.draft.gallery.find((item) => item.id === target.dataset.id);
      if (image) image[target.dataset.galleryField] = target.value;
      markDraftDirty();
    }
    if (target.dataset.createField) {
      state.createDialog[target.dataset.createField] = target.value;
      if (target.dataset.createField === 'title' && target.value.trim()) {
        state.createDialog.error = '';
      }
    }
  });

  document.addEventListener('change', async (event) => {
    if (event.target.id === 'sort') {
      state.sort = event.target.value;
      render();
    }
    if (event.target.id === 'tag-filter') {
      state.filters.tag = event.target.value;
      render();
    }
    if (event.target.id === 'model-filter') {
      state.filters.model = event.target.value;
      render();
    }
    if (event.target.id === 'theme-select') {
      state.settings.theme = event.target.value;
      await saveSettings();
      toast('Theme updated');
      render();
    }
  });

  document.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape' && state.createDialog.open) {
      closeCreateDialog();
      return;
    }
    if (event.key === 'Enter' && state.createDialog.open && event.target?.id === 'new-character-title') {
      event.preventDefault();
      await createCharacterFromDialog();
      return;
    }
    if (event.key === 'Escape' && state.draft) await closeEditor();
    if (event.key === 'Enter' && event.target.closest('.character-card')) openEditor(event.target.closest('.character-card').dataset.id);
  });

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('button, .character-card');
    if (!button) return;
    const action = button.dataset.action;
    if (button.dataset.nav) {
      state.view = button.dataset.nav;
      render();
      return;
    }
    if (!action) return;
    event.stopPropagation();

    if (action === 'create') openCreateDialog();
    if (action === 'create-cancel') closeCreateDialog();
    if (action === 'create-submit') await createCharacterFromDialog();
    if (action === 'open-editor') openEditor(button.dataset.id);
    if (action === 'close-editor') await closeEditor();
    if (action === 'save-draft') await saveDraft();
    if (action === 'copy-system') {
      const character = state.draft?.id === button.dataset.id ? state.draft : findCharacter(button.dataset.id);
      await copyText(character?.systemPrompt || '', 'Copied system prompt');
    }
    if (action === 'copy-full') await copyText(assemblePrompt(state.draft), 'Copied full character prompt');
    if (action === 'duplicate') await duplicateCharacter(button.dataset.id);
    if (action === 'delete') await deleteCharacter(button.dataset.id);
    if (action === 'archive') {
      const character = findCharacter(button.dataset.id);
      await archiveCharacter(button.dataset.id, !character?.archived);
    }
    if (action === 'toggle-filter') {
      state.filters[button.dataset.filter] = !state.filters[button.dataset.filter];
      render();
    }
    if (action === 'clear-filters') {
      state.query = '';
      state.filters = { favorite: false, archived: false, tag: '', model: '', gallery: false, scenes: false };
      render();
    }
    if (action === 'toggle-draft-bool') {
      state.draft[button.dataset.field] = !state.draft[button.dataset.field];
      markDraftDirty();
      render();
    }
    if (action === 'add-chip') addChip(button.dataset.kind, button.closest('.chip-editor').querySelector('input').value);
    if (action === 'remove-chip') removeChip(button.dataset.kind, button.dataset.id);
    if (action === 'add-scene') {
      state.draft.scenes.push({ id: uid(), title: '', body: '', tags: [], createdAt: nowIso(), updatedAt: nowIso() });
      markDraftDirty();
      render();
    }
    if (action === 'copy-scene') {
      const scene = state.draft.scenes.find((item) => item.id === button.dataset.id);
      await copyText(scene?.body || '', 'Copied scene');
    }
    if (action === 'duplicate-scene') {
      const scene = state.draft.scenes.find((item) => item.id === button.dataset.id);
      if (scene) state.draft.scenes.push({ ...structuredClone(scene), id: uid(), title: `${scene.title || 'Scene'} Copy`, createdAt: nowIso(), updatedAt: nowIso() });
      markDraftDirty();
      render();
    }
    if (action === 'delete-scene') {
      const ok = await confirmAction('Delete this scene?', 'Delete scene');
      if (ok) {
        state.draft.scenes = state.draft.scenes.filter((scene) => scene.id !== button.dataset.id);
        markDraftDirty();
        render();
      }
    }
    if (action === 'add-image') await addImages();
    if (action === 'set-cover') setCover(button.dataset.id);
    if (action === 'remove-image') await removeImage(button.dataset.id);
    if (action === 'lightbox') await showLightbox(button.dataset.id);
    if (action === 'open-data') {
      if (hasTauri()) await tauriInvoke('open_data_folder');
      else toast('Data folder is available in the desktop app');
    }
    if (action === 'backup') await createBackup();
    if (action === 'restore') await restoreBackup();
    if (action === 'kofi') {
      if (hasTauri()) await tauriOpenExternal(KO_FI_URL);
      else window.open(KO_FI_URL, '_blank', 'noopener');
    }
  });
}

function addChip(kind, rawValue) {
  const name = rawValue.trim();
  if (!name) return;
  const target = kind === 'tags' ? state.draft.tags : state.draft.compatibleModels;
  if (target.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
    toast('Already added');
    return;
  }
  target.push(kind === 'tags' ? { id: uid(), name } : { id: uid(), name, notes: '' });
  markDraftDirty();
  render();
}

function removeChip(kind, id) {
  if (kind === 'tags') state.draft.tags = state.draft.tags.filter((item) => item.id !== id);
  else state.draft.compatibleModels = state.draft.compatibleModels.filter((item) => item.id !== id);
  markDraftDirty();
  render();
}

async function addImages() {
  if (!hasTauri()) {
    toast('Image import is available in the desktop app');
    return;
  }
  const selected = await tauriDialogOpen({
    multiple: true,
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  });
  const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
  if (!paths.length) return;
  let addedCount = 0;
  let failedCount = 0;
  for (const path of paths) {
    const imageId = uid();
    const extension = path.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = `${imageId}.${extension}`;
    const originalPath = `media/characters/${state.draft.id}/originals/${filename}`;
    const thumbnailPath = `media/characters/${state.draft.id}/thumbnails/${imageId}.jpg`;
    try {
      await tauriInvoke('copy_image_to_app_data', { sourcePath: path, destFilename: originalPath });
      try {
        await tauriInvoke('generate_thumbnail', { relativePath: originalPath, thumbnailPath, force: true });
      } catch {
        toast('Image added without thumbnail');
      }
      state.draft.gallery.push({
        id: imageId,
        filename,
        originalPath,
        thumbnailPath,
        caption: '',
        notes: '',
        isCover: state.draft.gallery.length === 0,
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
      if (!state.draft.previewImageId) state.draft.previewImageId = imageId;
      addedCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error('Could not add image', error);
    }
  }
  state.imageCache.clear();
  if (addedCount > 0) {
    markDraftDirty();
    toast(addedCount === 1 ? 'Image added' : `${addedCount} images added`);
  }
  if (failedCount > 0) {
    toast(`${failedCount} image${failedCount === 1 ? '' : 's'} could not be added`, 'danger');
  }
  render();
}

function setCover(id) {
  state.draft.previewImageId = id;
  state.draft.gallery = state.draft.gallery.map((image) => ({ ...image, isCover: image.id === id }));
  markDraftDirty();
  render();
}

async function removeImage(id) {
  const image = state.draft.gallery.find((item) => item.id === id);
  if (!image) return;
  const ok = await confirmAction('Remove this gallery image and its local files?', 'Remove image');
  if (!ok) return;
  if (hasTauri()) {
    for (const relativePath of [image.originalPath, image.thumbnailPath]) {
      if (relativePath) await tauriInvoke('delete_path', { relativePath }).catch(console.warn);
    }
  }
  state.draft.gallery = state.draft.gallery.filter((item) => item.id !== id);
  if (state.draft.previewImageId === id) state.draft.previewImageId = state.draft.gallery[0]?.id || null;
  state.imageCache.clear();
  markDraftDirty();
  toast('Image removed');
  render();
}

async function showLightbox(id) {
  const image = state.draft.gallery.find((item) => item.id === id);
  const url = await loadImage(image?.originalPath || image?.thumbnailPath);
  if (!url) return;
  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.innerHTML = `<button aria-label="Close image preview">×</button><img src="${url}" alt="${escapeHtml(image.caption || state.draft.title)}" />`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

async function createBackup() {
  if (!hasTauri()) {
    toast('Backup is available in the desktop app');
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  const dest = await tauriDialogSave({
    defaultPath: `characterkeep-backup-${date}.zip`,
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
  });
  if (!dest) return;
  await saveAll();
  await tauriInvoke('create_characterkeep_backup_zip', { destPath: dest });
  toast('Backup created');
}

async function restoreBackup() {
  if (!hasTauri()) {
    toast('Restore is available in the desktop app');
    return;
  }
  const ok = await confirmAction('CharacterKeep will merge this backup into your current vault. Existing characters will not be overwritten.', 'Restore backup');
  if (!ok) return;
  const source = await tauriDialogOpen({ multiple: false, filters: [{ name: 'ZIP Archive', extensions: ['zip'] }] });
  if (!source) return;
  const summary = await tauriInvoke('restore_characterkeep_backup_zip', { sourcePath: source });
  state.characters = (await readJson(DATA_FILE, [])).map(normalizeCharacter);
  state.imageCache.clear();
  toast(`Restore completed: imported ${summary.imported}, skipped ${summary.skipped}, conflicts ${summary.conflicts}`);
  render();
}

async function init() {
  state.characters = (await readJson(DATA_FILE, [])).map(normalizeCharacter);
  state.settings = { theme: 'system', ...(await readJson(SETTINGS_FILE, {})) };
  if (hasTauri()) {
    state.dataPath = await tauriInvoke('get_app_data_path').catch(() => '');
  }
  applyTheme();
  bindEvents();
  await render();
}

init().catch((error) => {
  console.error(error);
  $('#app').innerHTML = `<main class="fatal"><h1>CharacterKeep could not start</h1><p>${escapeHtml(error.message || error)}</p></main>`;
});
