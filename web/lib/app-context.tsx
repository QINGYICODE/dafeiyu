'use client';
import { createContext, useContext } from 'react';
import type { CompanionState, Experience, Page } from './companion-types';
export type Action = (endpoint: string, method?: string, body?: unknown, message?: string) => Promise<unknown>;
export const AppContext = createContext<{
 data: CompanionState; go: (page: Page) => void; action: Action; refresh: () => Promise<void>; notify: (text: string) => void;
 busy: boolean; explore: (url?: string) => Promise<void>; openDetail: (experience: Experience) => void; shareLink: () => void;
} | null>(null);
export function useApp() { const value = useContext(AppContext); if (!value) throw new Error('App context missing'); return value; }
