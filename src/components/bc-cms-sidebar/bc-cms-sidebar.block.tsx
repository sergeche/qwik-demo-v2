import { component$ } from '@qwik.dev/core';
import { Sidebar } from '../sidebar/sidebar';
import type { BcCmsSidebarData } from './bc-cms-sidebar.data';

export const BcCmsSidebar = component$((props: { data: BcCmsSidebarData }) => {
    return (
      <div class="flex flex-auto pt-14">
        <p>Main block output</p>
        <ul class="main-block">
          {props.data.data.map((item, index) => (
            <li key={index}>{item.label}</li>
          ))}
        </ul>

        <p>Sidebar output</p>
        <Sidebar sidebarItems={props.data.data} />
      </div>
    );
  },
);
