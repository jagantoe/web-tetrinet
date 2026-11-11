import { Injectable, signal } from '@angular/core';
import { GameAction } from '../engine/player-engine';

export type MainPage = 'title' | 'partyline' | 'winlist' | 'misc' | 'client' | 'server';
export type ActiveWindow = 'main' | 'fields';
export type DialogKind = 'join' | 'accept' | 'occurrence' | 'key' | null;

export interface MessageBox {
  title: string;
  text: string;
  icon: 'info' | 'error';
}

@Injectable({ providedIn: 'root' })
export class UiStateService {
  readonly page = signal<MainPage>('title');
  readonly active = signal<ActiveWindow>('main');
  readonly dialog = signal<DialogKind>(null);
  readonly keyToChange = signal<GameAction | null>(null);
  readonly messageBox = signal<MessageBox | null>(null);

  alert(text: string, icon: 'info' | 'error' = 'info', title = 'TetriNET'): void {
    this.messageBox.set({ title, text, icon });
  }
}
