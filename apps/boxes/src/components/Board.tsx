import type { ReactNode } from 'react';
import {
  apply,
  BOXES,
  DOTS,
  hEdge,
  setup,
  vEdge,
  type Owner,
  type Player,
} from '../game/boxes';

export interface BoardState {
  edges: boolean[];
  edgeOwners: Owner[];
  owners: Owner[];
  lastEdge: number | null;
  lastClaimed: number[];
}

export function PlayerMark({ player }: { player: Player }) {
  return <span className={`player-mark player-${player}`} aria-hidden="true" />;
}

/** A calm, partly played board for the home hero. Deterministic. */
function makeHero(): BoardState {
  let state = setup(0);
  const opening = [
    0, 30, 5, 31, 6, 36, 1, 11, 37, 10, 40, 2, 32, 12, 41, 3, 33, 7, 13, 42, 4, 34, 14, 8,
  ];
  for (const edge of opening) {
    const result = apply(state, edge);
    if (result.ok) state = result.state;
  }
  return state;
}

export const HERO_BOARD: BoardState = makeHero();

function edgeLabel(edge: number): string {
  if (edge < 30) {
    return `Horizontal line, row ${Math.floor(edge / BOXES) + 1}, column ${(edge % BOXES) + 1}`;
  }
  const vertical = edge - 30;
  return `Vertical line, row ${Math.floor(vertical / DOTS) + 1}, column ${(vertical % DOTS) + 1}`;
}

export function Board({
  state,
  disabled = false,
  hint = null,
  onEdge,
  decorative = false,
  labelFor,
  boardLabel = 'Dots and boxes board',
}: {
  state: BoardState;
  disabled?: boolean;
  hint?: number | null;
  onEdge?: (edge: number) => void;
  decorative?: boolean;
  labelFor?: (edge: number) => string;
  boardLabel?: string;
}) {
  const dots = Array.from({ length: DOTS * DOTS }, (_, index) => {
    const row = Math.floor(index / DOTS);
    const col = index % DOTS;
    return (
      <span
        key={`dot-${index}`}
        className="dot"
        style={{ gridRow: row * 2 + 1, gridColumn: col * 2 + 1 }}
        aria-hidden="true"
      />
    );
  });

  const boxes = Array.from({ length: BOXES * BOXES }, (_, box) => {
    const row = Math.floor(box / BOXES);
    const col = box % BOXES;
    const owner = state.owners[box];
    const fresh = state.lastClaimed.includes(box);
    return (
      <div
        key={`box-${box}`}
        className={`box ${owner === 0 ? 'owned-0' : owner === 1 ? 'owned-1' : ''} ${fresh ? 'fresh' : ''}`}
        style={{ gridRow: row * 2 + 2, gridColumn: col * 2 + 2 }}
        aria-hidden="true"
      >
        {owner !== null && <span className={`box-claim claim-${owner}`} />}
      </div>
    );
  });

  const edges: ReactNode[] = [];
  for (let row = 0; row < DOTS; row++) {
    for (let col = 0; col < BOXES; col++) {
      const edge = hEdge(row, col);
      edges.push(
        <Edge
          key={`h-${row}-${col}`}
          edge={edge}
          kind="h"
          row={row}
          col={col}
          state={state}
          disabled={disabled}
          hint={hint}
          onEdge={onEdge}
          decorative={decorative}
          labelFor={labelFor}
        />,
      );
    }
  }
  for (let row = 0; row < BOXES; row++) {
    for (let col = 0; col < DOTS; col++) {
      const edge = vEdge(row, col);
      edges.push(
        <Edge
          key={`v-${row}-${col}`}
          edge={edge}
          kind="v"
          row={row}
          col={col}
          state={state}
          disabled={disabled}
          hint={hint}
          onEdge={onEdge}
          decorative={decorative}
          labelFor={labelFor}
        />,
      );
    }
  }

  return (
    <div
      className="board"
      role="group"
      aria-label={boardLabel}
      aria-hidden={decorative || undefined}
    >
      {dots}
      {boxes}
      {edges}
    </div>
  );
}

function Edge({
  edge,
  kind,
  row,
  col,
  state,
  disabled,
  hint,
  onEdge,
  decorative,
  labelFor,
}: {
  edge: number;
  kind: 'h' | 'v';
  row: number;
  col: number;
  state: BoardState;
  disabled: boolean;
  hint: number | null;
  onEdge?: (edge: number) => void;
  decorative: boolean;
  labelFor?: (edge: number) => string;
}) {
  const drawn = state.edges[edge];
  const owner = state.edgeOwners[edge];
  const last = state.lastEdge === edge;
  const classes = [
    'edge',
    kind === 'h' ? 'edge-h' : 'edge-v',
    drawn ? 'drawn' : '',
    owner === 0 ? 'p0' : owner === 1 ? 'p1' : '',
    last ? 'last' : '',
    hint === edge ? 'hint' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const style = {
    gridRow: kind === 'h' ? row * 2 + 1 : row * 2 + 2,
    gridColumn: kind === 'h' ? col * 2 + 2 : col * 2 + 1,
  };
  const label = labelFor?.(edge) ?? edgeLabel(edge);

  if (decorative) {
    return (
      <span className={classes} style={style} aria-hidden="true">
        <span className="edge-stroke" />
      </span>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      style={style}
      disabled={disabled}
      onClick={() => {
        if (!drawn) onEdge?.(edge);
      }}
      aria-label={drawn ? `${label}, drawn` : label}
      aria-disabled={drawn || disabled}
      data-edge={edge}
    >
      <span className="edge-stroke" />
    </button>
  );
}
