import { createContextId, useContext, getLocale, useContextProvider } from '@qwik.dev/core';

export interface Locale {
    lang: string;
}

export interface State {
    locale: Locale;
}

export const AppLocale = createContextId<State>('app-locale');
export const useLocale = (): Locale => useContext(AppLocale).locale;

export const useProvideLocale = () => {
    useContextProvider(AppLocale, {
        locale: {
            lang: getLocale('en'),
        },
    });
};