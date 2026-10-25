import {render} from 'preact';
import {App} from './app';
import {loadConfig} from './lib/storage';
import {applyBackground} from './lib/backgrounds';
import {applyTokens, colorsFor} from './theme/tokens';
import './theme/global.css';
import globalCss from './theme/global.css?raw';
import {LEGACY, startLegacyVars} from './lib/cssvars';
import {mark} from './lib/perfmarks';

mark('script started');

if (LEGACY) startLegacyVars(globalCss);       // Chromium 38: custom properties are emulated from the stylesheet source
const startConfig = loadConfig();
applyTokens(startConfig.theme, startConfig.glassTint, startConfig.reduceEffects);       // theme first, so there is no flash of the wrong colours
applyBackground(startConfig.background, colorsFor(startConfig.theme, startConfig.glassTint));
render(<App />, document.getElementById('root')!);
mark('first render');
window.requestAnimationFrame(() => window.requestAnimationFrame(() => mark('first frame drawn')));
