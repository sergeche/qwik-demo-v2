import { component$, isServer, Slot, useStyles$ } from "@qwik.dev/core";
import { RequestHandler, routeLoader$ } from "@qwik.dev/router";

import styles from "./styles.css?inline";
import { Header } from '~/components/header';

export const useServerTimeLoader = routeLoader$(() => {
  return {
    date: new Date().toISOString(),
  };
});

export default component$(() => {
  useStyles$(styles);
  return (
    <>
      <Header />
      <main>
        <Slot />
      </main>
    </>
  );
});

export const getLangFromPath = async (path: string) => {
  if (!isServer) throw new Error('Server only function');

  const m = path.match(/^\/(en|sr)\//);
  if (m) {
    return {
      path: path.slice(m[0].length - 1),
      lang: m[1],
    };
  }

  return {
    path,
    lang: 'sr',
  };
};

export const onRequest: RequestHandler = async ({ locale, pathname }) => {
  const langFromPath = await getLangFromPath(pathname);
  locale(langFromPath.lang);
};