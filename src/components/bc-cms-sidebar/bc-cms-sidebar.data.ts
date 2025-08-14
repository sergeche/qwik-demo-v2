import fs from 'node:fs/promises';
import path from 'node:path';
import { isServer } from '@qwik.dev/core';
import { SidebarItem } from '../sidebar/sidebar';
import { RequestEventLoader } from '@qwik.dev/router';

const __dirname = import.meta.dirname;

export type BcCmsSidebarData = Awaited<
  ReturnType<typeof BcCmsSidebarFetchData>
>;

export const BcCmsSidebarFetchData = (async (event: RequestEventLoader) => {
  if (!isServer) throw new Error('Server only function');
  console.log('Sidebar data for locale', event.locale())
  const locale = event.locale() ?? 'en'

  const contents = await fs.readFile(path.join(__dirname, `data-${locale}.json`), 'utf-8')

  return {
    data: JSON.parse(contents) as SidebarItem[]
  };
});
