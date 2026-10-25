/**
 * Kulissen-URLs, von Vite aufgelöst.
 *
 * Renderer (`renderer.js`) und Kulissenmaler (`kulisseUndWasser.js`) brauchen dieselbe
 * Liste derselben Dateien. Der Glob steht deshalb hier einmal; die Schlüssel tragen wie
 * von Vite vergeben das Präfix `./assets/backdrops/`.
 *
 * @module kulissenUrls
 */

export const BACKDROP_URLS = import.meta.glob('./assets/backdrops/**/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});

export default BACKDROP_URLS;
