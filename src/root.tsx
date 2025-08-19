import { component$ } from "@qwik.dev/core";
import { QwikRouterProvider, RouterOutlet } from '@qwik.dev/router';

import "./global.css";
import { useProvideLocale } from './composables/useLocale';

export default component$(() => {
  useProvideLocale()

  // const { url } = useLocation();

  /**
   * This is the root of a QwikRouter site. It contains the document's `<head>` and `<body>`. You can adjust them as you see fit.
   */

  return (
    <QwikRouterProvider>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

      </head>
      <body>
        <RouterOutlet />
      </body>
    </QwikRouterProvider>
  );
});
