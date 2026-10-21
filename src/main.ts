// The page: its styles (in this order: the base, the icons, the page, the editor's parts) and the editor
import './styles/base.css';
import '@fortawesome/fontawesome-free/css/fontawesome.css';
import '@fortawesome/fontawesome-free/css/solid.css';
import '@fortawesome/fontawesome-free/css/regular.css';
import './styles/page.css';
import './styles/components.css';
import './styles/editor.css';
import { createApp } from 'vue';
import { i18n, loadLang } from './i18n';
import App from './App.vue';

// ?loading (to look at it): the loading screen stays, the editor is not mounted; ?loading=slow shows
// it as on a slow connection at once
const held = new URLSearchParams(window.location.search).get('loading');
if (held === 'slow') document.getElementById('boot')?.classList.add('slow');

// mounted on the body itself, once the texts of the language are there: the page's parts are its
// children, as the styles expect. index.html's loading screen, taken off the body as it is mounted,
// is put back over the editor and fades out
if (held === null) loadLang().then(function () {
    const boot = document.getElementById('boot');
    createApp(App).use(i18n).mount('body');
    if (!boot) return;
    document.body.appendChild(boot);
    requestAnimationFrame(function () { requestAnimationFrame(function () { boot.classList.add('gone'); }); });
    window.setTimeout(function () { boot.remove(); }, 500);
});
