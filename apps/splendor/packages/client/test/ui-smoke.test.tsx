// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import App from '../src/App';
import { useGame } from '../src/store';

beforeAll(() => {
  // jsdom 缺失的浏览器 API（motion / framer-motion 需要）
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as Record<string, unknown>).ResizeObserver = RO;
  (globalThis as Record<string, unknown>).matchMedia =
    (globalThis as Record<string, unknown>).matchMedia ??
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
});

afterEach(() => {
  cleanup();
  useGame.getState().backToMenu();
});

describe('UI 渲染冒烟', () => {
  it('主菜单 -> 人机对战：棋盘、玩家面板、宝石银行渲染成功', () => {
    const { container } = render(<App />);
    expect(screen.getAllByText(/Splendor/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('开始游戏'));
    const g = useGame.getState().game;
    expect(g).toBeTruthy();
    // 玩家面板（玩家1 / 电脑2）
    expect(screen.getAllByText(/玩家\d|电脑\d/).length).toBeGreaterThan(0);
    // 宝石供给区（六堆：五色 + 金币；无文字标签，通过 data 属性定位）
    expect(container.querySelectorAll('[data-testid="gem-pile"]').length).toBe(5);
    // 贵族列与三档牌堆
    expect(screen.getAllByText('贵族').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^[123] 级$/).length).toBeGreaterThanOrEqual(3);
  });

  it('拿取交互：点击宝石 -> 确认拿取 -> 状态变化', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText('开始游戏'));
    const before = useGame.getState().game!;
    expect(before.current).toBe(0);
    // 点击「钻石」宝石堆（银行按钮）
    const pile = container.querySelector('[data-gem="white"]') as HTMLElement;
    expect(pile).toBeTruthy();
    fireEvent.click(pile);
    fireEvent.click(screen.getByText('确认拿取'));
    const after = useGame.getState().game!;
    expect(after.moves.length).toBe(1);
    expect(after.players[0]!.tokens.white).toBe(1);
  });

  it('预定卡后：面板中的小卡带完整成本信息（不再只显示等级）', () => {
    render(<App />);
    fireEvent.click(screen.getByText('开始游戏'));
    // 直接通过 store 预定一张明牌（等价于点击卡片 -> 气泡 -> 预定）
    act(() => {
      const ok = useGame.getState().applyHumanMove({ type: 'reserve', target: { kind: 'board', tier: 3, slot: 0 } });
      expect(ok).toBe(true);
    });

    const mini = document.querySelector('[data-testid="reserved-mini"]');
    expect(mini).toBeTruthy();
    // 小卡上必须出现成本芯片（title 形如「宝石名 ×数量」）
    const costChip = mini!.querySelector('[title*="×"]');
    expect(costChip).toBeTruthy();
    // 且预定区计数可见
    expect(screen.getAllByText(/预定 \d\/3/).length).toBeGreaterThan(0);
  });

  it('卡牌库页面可渲染并筛选', () => {
    render(<App />);
    fireEvent.click(screen.getByText(/卡牌库/));
    expect(screen.getAllByText(/卡牌库/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('1 级'));
    expect(useGame.getState().screen).toBe('library');
  });
});
