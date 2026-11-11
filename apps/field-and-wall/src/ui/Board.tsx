import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react';
import type { MeepleChoice } from '../game/engine';
import { cellKey } from '../game/features';
import { localFeatures } from '../game/tiles';
import type { Cell, PlacedTile, Rotation } from '../game/types';
import { TileArt } from './TileArt';
import { palette } from './theme';

interface BoardProps {
  tiles: PlacedTile[];
  currentTile?: string | null;
  rotation?: Rotation;
  validSlots?: Cell[];
  rotatableSlots?: Cell[];
  blockedSlots?: Cell[];
  selectedSlot?: Cell | null;
  meepleChoices?: MeepleChoice[];
  selectedMeeple?: number | null;
  highlight?: Cell[];
  lastPlaced?: Cell | null;
  hintSlot?: Cell | null;
  interactive?: boolean;
  fitKey?: string | number;
  onSlot?: (cell: Cell) => void;
  onInvalidSlot?: (cell: Cell, kind: 'rotation' | 'edges') => void;
  onFeature?: (index: number) => void;
  compact?: boolean;
  ariaLabel?: string;
}

interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

function useBounds(tiles: PlacedTile[], cells: Cell[], compact: boolean): { minX: number; maxX: number; minY: number; maxY: number; cx: number; cy: number; w: number; h: number } {
  return useMemo(() => {
    let minX = 0;
    let maxX = 1;
    let minY = 0;
    let maxY = 1;
    for (const tile of tiles) {
      minX = Math.min(minX, tile.x);
      maxX = Math.max(maxX, tile.x + 1);
      minY = Math.min(minY, tile.y);
      maxY = Math.max(maxY, tile.y + 1);
    }
    for (const cell of cells) {
      minX = Math.min(minX, cell.x);
      maxX = Math.max(maxX, cell.x + 1);
      minY = Math.min(minY, cell.y);
      maxY = Math.max(maxY, cell.y + 1);
    }
    const pad = compact ? 0.5 : 1.35;
    const w = Math.max(compact ? 420 : 680, (maxX - minX + pad * 2) * 100);
    const h = Math.max(compact ? 340 : 520, (maxY - minY + pad * 2) * 100);
    return {
      minX: minX - pad,
      maxX: maxX + pad,
      minY: minY - pad,
      maxY: maxY + pad,
      cx: ((minX + maxX) / 2) * 100,
      cy: ((minY + maxY) / 2) * 100,
      w,
      h,
    };
  }, [tiles, cells, compact]);
}

function Compass({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={0.5} aria-hidden>
      <circle r={34} fill="none" stroke={palette.lineStrong} strokeWidth={1.4} />
      <circle r={26} fill="none" stroke={palette.lineStrong} strokeWidth={0.7} strokeDasharray="2 4" />
      <path d="M 0 -26 L 7 0 L 0 26 L -7 0 Z" fill={palette.ink} opacity={0.5} />
      <path d="M 0 -26 L 7 0 L 0 0 Z" fill={palette.gold} opacity={0.85} />
      <text x={0} y={-41} textAnchor="middle" fontSize={13} fontFamily="Georgia, serif" fill={palette.ink2} opacity={0.7}>
        N
      </text>
    </g>
  );
}

export function Board({
  tiles,
  currentTile = null,
  rotation = 0,
  validSlots = [],
  rotatableSlots = [],
  blockedSlots = [],
  selectedSlot = null,
  meepleChoices = [],
  selectedMeeple = null,
  highlight = [],
  lastPlaced = null,
  hintSlot = null,
  interactive = true,
  fitKey = 'board',
  onSlot,
  onInvalidSlot,
  onFeature,
  compact = false,
  ariaLabel = 'Field & Wall map',
}: BoardProps) {
  const [view, setView] = useState<ViewState>({ zoom: 1, panX: 0, panY: 0 });
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const frontier = useMemo(
    () => [...validSlots, ...rotatableSlots, ...blockedSlots],
    [validSlots, rotatableSlots, blockedSlots],
  );
  const bounds = useBounds(tiles, frontier, compact);
  const occ = useMemo(() => new Set(tiles.map((t) => cellKey(t.x, t.y))), [tiles]);
  const highlighted = useMemo(() => new Set(highlight.map((c) => cellKey(c.x, c.y))), [highlight]);

  useEffect(() => {
    setView({ zoom: 1, panX: 0, panY: 0 });
  }, [fitKey]);

  const vbW = bounds.w / view.zoom;
  const vbH = bounds.h / view.zoom;
  const vbX = bounds.cx - vbW / 2 + view.panX;
  const vbY = bounds.cy - vbH / 2 + view.panY;

  const zoomBy = (factor: number): void => {
    setView((prev) => ({ ...prev, zoom: Math.max(0.55, Math.min(2.6, prev.zoom * factor)) }));
  };

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>): void => {
    if (!interactive) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.12 : 0.89);
  };

  const startDrag = (event: ReactPointerEvent<SVGRectElement>): void => {
    if (!interactive) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, panX: view.panX, panY: view.panY };
    setDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<SVGRectElement>): void => {
    if (!drag.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    const scaleX = vbW / Math.max(1, rect.width);
    const scaleY = vbH / Math.max(1, rect.height);
    setView((prev) => ({
      ...prev,
      panX: drag.current ? drag.current.panX - dx * scaleX : prev.panX,
      panY: drag.current ? drag.current.panY - dy * scaleY : prev.panY,
    }));
  };

  const endDrag = (): void => {
    drag.current = null;
    setDragging(false);
  };

  const selectedKey = selectedSlot ? cellKey(selectedSlot.x, selectedSlot.y) : null;
  const gridLines = useMemo(() => {
    const lines: ReactNode[] = [];
    for (let x = Math.floor(bounds.minX) - 2; x <= Math.ceil(bounds.maxX) + 2; x++) {
      lines.push(
        <line
          key={`x${x}`}
          x1={x * 100}
          y1={(bounds.minY - 2) * 100}
          x2={x * 100}
          y2={(bounds.maxY + 2) * 100}
          stroke={palette.lineStrong}
          strokeWidth={0.7}
          opacity={0.16}
        />,
      );
    }
    for (let y = Math.floor(bounds.minY) - 2; y <= Math.ceil(bounds.maxY) + 2; y++) {
      lines.push(
        <line
          key={`y${y}`}
          x1={(bounds.minX - 2) * 100}
          y1={y * 100}
          x2={(bounds.maxX + 2) * 100}
          y2={y * 100}
          stroke={palette.lineStrong}
          strokeWidth={0.7}
          opacity={0.16}
        />,
      );
    }
    return lines;
  }, [bounds]);

  return (
    <div className={`board-wrap${compact ? ' board-wrap--compact' : ''}`}>
      <svg
        ref={svgRef}
        className={`board-svg${dragging ? ' is-dragging' : ''}`}
        viewBox={`${vbX.toFixed(2)} ${vbY.toFixed(2)} ${vbW.toFixed(2)} ${vbH.toFixed(2)}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label={ariaLabel}
        onWheel={onWheel}
        style={{ touchAction: 'none' }}
      >
        <defs>
          <filter id="fw-tile-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.2" floodColor="#4e432f" floodOpacity="0.28" />
          </filter>
          <filter id="fw-soft-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="fw-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="9" stroke={palette.wall} strokeWidth="1.2" opacity="0.28" />
          </pattern>
        </defs>

        <rect
          x={(bounds.minX - 6) * 100}
          y={(bounds.minY - 6) * 100}
          width={bounds.w + 1200}
          height={bounds.h + 1200}
          fill={palette.paper}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ cursor: interactive ? (dragging ? 'grabbing' : 'grab') : 'default' }}
        />
        <g opacity={0.6}>{gridLines}</g>
        <Compass x={bounds.maxX * 100 - 80} y={bounds.minY * 100 + 72} />

        {/* map border for context */}
        <rect
          x={bounds.minX * 100}
          y={bounds.minY * 100}
          width={(bounds.maxX - bounds.minX) * 100}
          height={(bounds.maxY - bounds.minY) * 100}
          fill="none"
          stroke={palette.lineStrong}
          strokeWidth={1.2}
          opacity={0.28}
          strokeDasharray="2 8"
          pointerEvents="none"
        />

        {tiles.map((tile, index) => {
          const key = cellKey(tile.x, tile.y);
          const isLast = lastPlaced && lastPlaced.x === tile.x && lastPlaced.y === tile.y;
          const isHighlighted = highlighted.has(key);
          return (
            <g key={`${key}-${index}`} transform={`translate(${tile.x * 100} ${tile.y * 100})`} data-tile={key}>
              {isHighlighted && (
                <rect
                  x={-2}
                  y={-2}
                  width={104}
                  height={104}
                  rx={6}
                  fill={palette.gold}
                  opacity={0.18}
                  stroke={palette.gold}
                  strokeWidth={2.6}
                  pointerEvents="none"
                />
              )}
              <g filter="url(#fw-tile-shadow)">
                <TileArt
                  typeId={tile.type}
                  rot={tile.rot}
                  meeple={tile.meeple}
                  meepleFeature={tile.meepleFeature}
                />
              </g>
              {isLast && (
                <rect
                  x={0.8}
                  y={0.8}
                  width={98.4}
                  height={98.4}
                  rx={4}
                  fill="none"
                  stroke={palette.goldDeep}
                  strokeWidth={1.6}
                  opacity={0.6}
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}

        {/* legal ghosts */}
        {interactive &&
          currentTile &&
          validSlots.map((cell) => {
            const key = cellKey(cell.x, cell.y);
            if (occ.has(key)) return null;
            const selected = selectedKey === key;
            const isHover = hover === key;
            return (
              <g
                key={`valid-${key}`}
                data-slot={key}
                transform={`translate(${cell.x * 100} ${cell.y * 100})`}
                className={`board-slot${selected ? ' is-selected' : ''}${isHover ? ' is-hover' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`Place tile at ${cell.x}, ${cell.y}`}
                onClick={() => onSlot?.(cell)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSlot?.(cell);
                  }
                }}
                onPointerEnter={() => setHover(key)}
                onPointerLeave={() => setHover((v) => (v === key ? null : v))}
              >
                <rect
                  x={1.5}
                  y={1.5}
                  width={97}
                  height={97}
                  rx={5}
                  fill={palette.fieldLight}
                  opacity={selected ? 1 : isHover ? 0.78 : 0.52}
                />
                <g opacity={selected ? 1 : isHover ? 0.85 : 0.55} pointerEvents="none">
                  <TileArt typeId={currentTile} rot={rotation} />
                </g>
                <rect
                  x={1}
                  y={1}
                  width={98}
                  height={98}
                  rx={5}
                  fill="none"
                  stroke={selected ? palette.gold : palette.gold}
                  strokeWidth={selected ? 3 : 2}
                  strokeDasharray={selected ? undefined : '6 4'}
                />
                {!selected && (
                  <g pointerEvents="none">
                    <circle cx={50} cy={50} r={12.5} fill="#fff8e6" opacity={0.94} stroke={palette.goldDeep} strokeWidth={1.2} />
                    <path d="M43 50h14M50 43v14" stroke={palette.goldDeep} strokeWidth={2} strokeLinecap="round" />
                  </g>
                )}
                {selected && (
                  <g className="meeple-spot-layer">
                    {meepleChoices.map((choice) => {
                      const local = localFeatures(currentTile, rotation)[choice.index];
                      if (!local) return null;
                      const disabled = choice.occupied || choice.complete;
                      const chosen = selectedMeeple === choice.index;
                      return (
                        <g
                          key={choice.index}
                          transform={`translate(${local.anchor.x * 100} ${local.anchor.y * 100})`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Place meeple on ${choice.type}`}
                          className={`meeple-spot${chosen ? ' is-chosen' : ''}${disabled ? ' is-disabled' : ''}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!disabled) onFeature?.(choice.index);
                          }}
                          onKeyDown={(event) => {
                            if ((event.key === 'Enter' || event.key === ' ') && !disabled) {
                              event.preventDefault();
                              event.stopPropagation();
                              onFeature?.(choice.index);
                            }
                          }}
                        >
                          <circle r={11} fill={chosen ? palette.ink : '#fff8e6'} stroke={chosen ? palette.gold : palette.ink2} strokeWidth={1.6} opacity={disabled ? 0.45 : 0.95} />
                          <circle r={4.6} fill={choice.type === 'city' ? palette.roof : choice.type === 'road' ? palette.roadEdge : palette.moss} opacity={disabled ? 0.4 : 1} />
                          {disabled && <line x1={-8} y1={8} x2={8} y2={-8} stroke={palette.wallDark} strokeWidth={1.5} />}
                        </g>
                      );
                    })}
                  </g>
                )}
              </g>
            );
          })}

        {hintSlot && (
          <g
            transform={`translate(${hintSlot.x * 100} ${hintSlot.y * 100})`}
            pointerEvents="none"
            className="hint-slot"
          >
            <rect
              x={-5}
              y={-5}
              width={110}
              height={110}
              rx={8}
              fill="none"
              stroke={palette.goldDeep}
              strokeWidth={3}
              strokeDasharray="9 6"
            />
          </g>
        )}

        {/* slots that need another rotation */}
        {interactive &&
          currentTile &&
          rotatableSlots.map((cell) => {
            const key = cellKey(cell.x, cell.y);
            if (occ.has(key) || validSlots.some((v) => v.x === cell.x && v.y === cell.y)) return null;
            return (
              <g
                key={`rot-${key}`}
                data-slot={key}
                data-invalid="rotation"
                transform={`translate(${cell.x * 100} ${cell.y * 100})`}
                role="button"
                tabIndex={0}
                aria-label={`Needs a rotation at ${cell.x}, ${cell.y}`}
                onClick={() => onInvalidSlot?.(cell, 'rotation')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onInvalidSlot?.(cell, 'rotation');
                  }
                }}
              >
                <rect x={9} y={9} width={82} height={82} rx={6} fill={palette.paper2} opacity={0.72} stroke={palette.lineStrong} strokeWidth={1.6} strokeDasharray="5 5" />
                <text x={50} y={57} textAnchor="middle" fontSize={24} fill={palette.muted} fontFamily="Georgia, serif">
                  ↻
                </text>
              </g>
            );
          })}

        {/* completely blocked frontier cells */}
        {interactive &&
          currentTile &&
          blockedSlots.map((cell) => {
            const key = cellKey(cell.x, cell.y);
            if (
              occ.has(key) ||
              validSlots.some((v) => v.x === cell.x && v.y === cell.y) ||
              rotatableSlots.some((v) => v.x === cell.x && v.y === cell.y)
            ) {
              return null;
            }
            return (
              <g
                key={`blocked-${key}`}
                data-slot={key}
                data-invalid="edges"
                transform={`translate(${cell.x * 100} ${cell.y * 100})`}
                role="button"
                tabIndex={0}
                aria-label={`Cannot place at ${cell.x}, ${cell.y}`}
                onClick={() => onInvalidSlot?.(cell, 'edges')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onInvalidSlot?.(cell, 'edges');
                  }
                }}
              >
                <rect x={16} y={16} width={68} height={68} rx={5} fill="url(#fw-hatch)" opacity={0.45} stroke={palette.lineStrong} strokeWidth={1.1} />
                <text x={50} y={56} textAnchor="middle" fontSize={17} fill={palette.muted} fontFamily="Georgia, serif">
                  ×
                </text>
              </g>
            );
          })}
      </svg>

      {interactive && (
        <div className="board-controls" aria-label="Map controls">
          <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom in" title="Zoom in">
            +
          </button>
          <button type="button" onClick={() => zoomBy(0.83)} aria-label="Zoom out" title="Zoom out">
            −
          </button>
          <button
            type="button"
            className="board-controls__fit"
            onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })}
            aria-label="Fit the whole map"
            title="Fit the whole map"
          >
            ⤢
          </button>
        </div>
      )}
    </div>
  );
}
