import { createRoute, createHistoryRouter, createRouterControls } from 'atomic-router';
import { createBrowserHistory } from 'history';

// 1. Definition of routes
export const routes = {
  home: createRoute(),
  events: createRoute(),
  recommended: createRoute(),
  favorites: createRoute(),
  eventDetails: createRoute<{ id: string }>(),
  login: createRoute(),
};

// 2. Mapping routes to paths
export const router = createHistoryRouter({
  routes: [
    { path: '/', route: routes.home },
    { path: '/events', route: routes.events },
    { path: '/recommended', route: routes.recommended },
    { path: '/favorites', route: routes.favorites },
    { path: '/events/:id', route: routes.eventDetails },
    { path: '/login', route: routes.login },
  ],
});

// 3. Router controls and history
export const controls = createRouterControls();
export const history = createBrowserHistory();
