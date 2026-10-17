// The page: its styles (in this order: the base, the icons, the page, the editor's parts) and the editor
import './styles/base.css';
import '@fortawesome/fontawesome-free/css/fontawesome.css';
import '@fortawesome/fontawesome-free/css/solid.css';
import '@fortawesome/fontawesome-free/css/regular.css';
import './styles/page.css';
import './styles/sim_modern.css';
import './styles/editor.css';
import { createApp } from 'vue';
import { i18n } from './i18n';
import App from './App.vue';

// OpenCV.js gives a promise of itself until its WebAssembly is ready: then the global cv is OpenCV
const w = window as unknown as { cv?: unknown };
if (w.cv && typeof (w.cv as Promise<unknown>).then === 'function') (w.cv as Promise<unknown>).then(function (ready) { w.cv = ready; });

// mounted on the body itself: the page's parts are its children, as the styles expect
createApp(App).use(i18n).mount('body');
