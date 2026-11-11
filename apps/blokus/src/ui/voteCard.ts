import { el, button } from './dom';

export interface VoteCardButton {
  label: string;
  primary?: boolean;
  danger?: boolean;
  onClick: () => void;
}

export interface VoteCardOptions {
  title: string;
  body: string;
  buttons: VoteCardButton[];
  status?: string;
}

/** centred modal used for the undo vote (and the waiting state) */
export class VoteCard {
  private readonly root: HTMLElement;

  constructor() {
    this.root = el('div', 'vote-card hidden');
    document.body.appendChild(this.root);
  }

  show(opts: VoteCardOptions): void {
    const panel = el('div', 'vote-panel');
    panel.appendChild(el('h3', 'vote-title', opts.title));
    panel.appendChild(el('div', 'vote-body', opts.body));
    if (opts.status) panel.appendChild(el('div', 'vote-status', opts.status));
    const actions = el('div', 'vote-actions');
    for (const b of opts.buttons) {
      const cls = b.primary ? 'btn primary' : b.danger ? 'btn danger' : 'btn';
      actions.appendChild(button(cls, b.label, b.onClick));
    }
    panel.appendChild(actions);
    this.root.replaceChildren(panel);
    this.root.classList.remove('hidden');
  }

  setStatus(text: string): void {
    const status = this.root.querySelector('.vote-status');
    if (status) status.textContent = text;
    else {
      const panel = this.root.querySelector('.vote-panel');
      if (panel) panel.insertBefore(el('div', 'vote-status', text), panel.querySelector('.vote-actions'));
    }
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.root.replaceChildren();
  }

  destroy(): void {
    this.root.remove();
  }
}
