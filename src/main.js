// Démarrage de UImaker_noob (PROTOTYPE) : assemble les 4 fenêtres et branche le clavier.
import { appState, notifyChange, stepHistory, subscribeToChanges } from './model/store.js';
import { startProjects } from './model/projects.js';
import { closeProjectsWindow, isProjectsWindowOpen } from './ui/projectsWindow.js';
import { createTopBar, renderTopBar } from './ui/topBar.js';
import { createLeftPanel, renderLeftPanel } from './ui/leftPanel.js';
import { createRightPanel, renderRightPanel } from './ui/rightPanel.js';
import { createCanvasView, renderCanvasView } from './ui/canvasView.js';
import { loadModuleLibrary } from './io/moduleLibrary.js';
import { deleteSelection, duplicateSelection } from './ui/editorActions.js';

/**
 * Indique si le clavier sert à un champ de saisie (on ne détourne pas ses touches).
 * @param {EventTarget|null} eventTarget cible
 * @returns {boolean} vrai si c'est un champ
 */
function isTypingTarget(eventTarget) {
  return eventTarget instanceof HTMLElement && (eventTarget.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(eventTarget.tagName));
}

/**
 * Raccourcis clavier (PC et clavier iPad).
 * @param {KeyboardEvent} keyboardEvent événement
 */
function handleKeyDown(keyboardEvent) {
  if (isProjectsWindowOpen()) { if (keyboardEvent.key === 'Escape') closeProjectsWindow(); return; }
  if (isTypingTarget(keyboardEvent.target)) return;
  const isCommand = keyboardEvent.ctrlKey || keyboardEvent.metaKey;
  const lowerKey = keyboardEvent.key.toLowerCase();
  if (isCommand && lowerKey === 'z') { keyboardEvent.preventDefault(); stepHistory(keyboardEvent.shiftKey ? 1 : -1); }
  else if (isCommand && lowerKey === 'y') { keyboardEvent.preventDefault(); stepHistory(1); }
  else if (isCommand && lowerKey === 'd') { keyboardEvent.preventDefault(); duplicateSelection(); }
  else if (keyboardEvent.key === 'Delete' || keyboardEvent.key === 'Backspace') { keyboardEvent.preventDefault(); deleteSelection(); }
  else if (keyboardEvent.key === 'Escape') { appState.armedLibraryItem = null; appState.selectedId = null; notifyChange(); }
}

/** Redessine toutes les fenêtres. */
function renderAll() {
  renderTopBar();
  renderLeftPanel();
  renderRightPanel();
  renderCanvasView();
}

/** Assemble l'application. */
async function startApplication() {
  await startProjects();
  const appRoot = document.getElementById('app');
  appRoot.append(createTopBar(), createLeftPanel(), createCanvasView(), createRightPanel());
  subscribeToChanges(renderAll);
  window.addEventListener('keydown', handleKeyDown);
  renderAll();
  loadModuleLibrary().catch((error) => console.error('loadModuleLibrary', error));
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).catch((error) => console.error('startApplication (service worker)', error));
  }
}

startApplication();
