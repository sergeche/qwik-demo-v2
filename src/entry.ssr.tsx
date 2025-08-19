/**
 * WHAT IS THIS FILE?
 *
 * SSR renderer function, used by Qwik Router.
 *
 * Note that this is the only place the Qwik renderer is called.
 * On the client, containers resume and do not call render.
 */
import { manifest } from '@qwik-client-manifest';
import {
  renderToStream,
  type RenderToStreamOptions,
} from '@qwik.dev/core/server';
import type { RenderOptions } from '@qwik.dev/core';
import { isDev } from '@qwik.dev/core/build';
import Root from "./root";

export function extractBase({ serverData }: RenderOptions): string {
  const appPrefix = import.meta.env['PUBLIC_APP_PREFIX']
    ? `/${import.meta.env['PUBLIC_APP_PREFIX']}`
    : '';

  if (isDev) return `${appPrefix}/build`;

  if (!isDev && serverData?.locale) {
    return `${appPrefix}/build/` + serverData.locale;
  } else {
    return `${appPrefix}/build`;
  }
}

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    manifest,
    ...opts,
    // Use container attributes to set attributes on the html tag.
    containerAttributes: {
      lang: opts.serverData?.locale || 'en',
      ...opts.containerAttributes,
    },
    // Determine the base URL for the client code
    base: extractBase,
  });
}
