function getTauriGlobal() {
  return window.__TAURI__ || null;
}

function requireFunction(fn, name) {
  if (typeof fn !== 'function') throw new Error(`${name} is unavailable`);
  return fn;
}

export function tauriInvoke(command, payload = {}) {
  return requireFunction(getTauriGlobal()?.core?.invoke, 'Tauri core.invoke')(command, payload);
}

export function tauriDialogOpen(options) {
  return requireFunction(getTauriGlobal()?.dialog?.open, 'Tauri dialog.open')(options);
}

export function tauriDialogSave(options) {
  return requireFunction(getTauriGlobal()?.dialog?.save, 'Tauri dialog.save')(options);
}

export function tauriDialogConfirm(message, options) {
  return requireFunction(getTauriGlobal()?.dialog?.confirm, 'Tauri dialog.confirm')(message, options);
}

export function tauriOpenExternal(url) {
  return requireFunction(getTauriGlobal()?.opener?.open, 'Tauri opener.open')(url);
}

export function hasTauri() {
  return Boolean(getTauriGlobal()?.core?.invoke);
}
