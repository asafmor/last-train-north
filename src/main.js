import { Game } from './game.js';
import { loadAssets } from './assets.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch { return false; }
}

if (!webglAvailable()) {
  window.__ltnFailed = true;
  window.__ltnFail('WebGL is not available in this browser. Enable hardware acceleration or try a recent Chrome, Firefox or Edge.');
} else {
  try {
    await loadAssets();
    window.__game = new Game(document.getElementById('app'));
    window.__ltnReady = true;
  } catch (err) {
    console.error(err);
    window.__ltnFailed = true;
    window.__ltnFail('Failed to start the game: ' + err.message);
  }
}
