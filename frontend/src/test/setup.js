// src/test/setup.js

import '@testing-library/jest-dom';
import { vi, beforeAll, afterEach } from 'vitest'; // 从 vitest 导入 beforeAll 和 afterEach
import MatchMediaMock from 'jest-matchmedia-mock'; // 导入新安装的库

global.jest = vi;

// Mock localStorage (保持不变)
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock;

// Mock console methods (保持不变)
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// --- ↓↓↓ 这里是核心修改区域 ↓↓↓ ---

// 1. 删除下面这整段旧的、不完善的 mock
/* Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({ ... })),
});
*/

// 2. 添加下面这段新的、更健壮的 mock
let matchMedia;

beforeAll(() => {
  matchMedia = new MatchMediaMock();
});

afterEach(() => {
  matchMedia.clear();
});

// --- ↑↑↑ 修改结束 ↑↑↑ ---


// Mock ResizeObserver (保持不变)
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver (保持不变)
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));