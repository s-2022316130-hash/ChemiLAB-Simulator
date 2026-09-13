import { createShell } from './app/shell.js';
import { createRouter } from './app/router.js';
import { homePage, simulatorsPage, simulatorPage } from './app/pages.js';
import { getSimulator } from './app/registry.js';

const shell = createShell(document.getElementById('app'));
const router = createRouter({
  home: () => homePage(shell.view),
  simulators: () => simulatorsPage(shell.view),
  simulator: ({ id }) => simulatorPage(shell.view, id)
}, route => shell.setRoute(route, route.params.id ? getSimulator(route.params.id)?.name : null));
router.start();
