"use client";

/** 只登记打开的工程身份和显示状态；作品、历史和任务仍在各自编辑器实例里。 */
import { create } from "zustand";
interface CanvasSession { id: string; name: string }
interface CanvasSessionsState {
  sessions: CanvasSession[];
  activeId: string | null;
  target: HTMLElement | null;
  closeRequested: string | null;
  open: (id: string, name: string) => void;
  rename: (id: string, name: string) => void;
  showLibrary: () => void;
  remove: (id: string) => void;
}

export const useCanvasSessionsStore = create<CanvasSessionsState>(set => ({
  sessions: [], activeId: null, target: null, closeRequested: null,
  open: (id, name) => set(state => ({
    sessions: state.sessions.some(item => item.id === id) ? state.sessions : [...state.sessions, { id, name }], activeId: id,
  })),
  rename: (id, name) => set(state => state.sessions.find(item => item.id === id)?.name === name ? state : {
    sessions: state.sessions.map(item => item.id === id ? { ...item, name } : item),
  }),
  showLibrary: () => set({ activeId: null }),
  remove: id => set(state => ({ sessions: state.sessions.filter(item => item.id !== id),
    activeId: state.activeId === id ? null : state.activeId, closeRequested: null })),
}));
