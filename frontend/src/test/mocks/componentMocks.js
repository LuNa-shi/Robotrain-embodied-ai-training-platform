import { vi } from 'vitest';

// Mock motion data
export const mockMotionData = {
  length: 100,
  frames: Array.from({ length: 100 }, (_, i) => ({
    frame: i,
    position: { x: i * 0.1, y: i * 0.05, z: 0 },
    rotation: { x: 0, y: i * 0.01, z: 0 }
  }))
};

// Mock robot controller props
export const mockRobotControllerProps = {
  isAnimating: false,
  currentFrame: 0,
  motionDataLength: 100,
  currentEpisode: 1,
  onToggleAnimation: vi.fn(),
  onReset: vi.fn(),
  onNextEpisode: vi.fn(),
  renderButtonsOnly: false,
  renderTextOnly: false
};

// Mock animation states
export const mockAnimationStates = {
  playing: {
    isAnimating: true,
    currentFrame: 25,
    motionDataLength: 100,
    currentEpisode: 1
  },
  paused: {
    isAnimating: false,
    currentFrame: 50,
    motionDataLength: 100,
    currentEpisode: 1
  },
  noData: {
    isAnimating: false,
    currentFrame: 0,
    motionDataLength: 0,
    currentEpisode: null
  }
};

// Mock user interactions
export const mockUserInteractions = {
  clickPlay: { type: 'click', target: { textContent: '播放' } },
  clickPause: { type: 'click', target: { textContent: '暂停' } },
  clickReset: { type: 'click', target: { textContent: '重置' } },
  clickNext: { type: 'click', target: { textContent: '下一个' } }
}; 