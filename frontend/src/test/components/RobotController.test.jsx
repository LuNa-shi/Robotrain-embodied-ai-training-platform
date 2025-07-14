import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RobotController from '@/components/RobotController';
import { mockRobotControllerProps, mockAnimationStates } from '../mocks/componentMocks';

// Mock Ant Design components
vi.mock('antd', () => ({
  Button: ({ children, onClick, disabled, type, icon, ...props }) => (
    <button 
      onClick={onClick} 
      disabled={disabled} 
      data-testid={`button-${children}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  ),
  Space: ({ children, ...props }) => (
    <div data-testid="space" {...props}>
      {children}
    </div>
  )
}));

// Mock Ant Design icons
vi.mock('@ant-design/icons', () => ({
  PlayCircleOutlined: () => <span data-testid="play-icon">▶</span>,
  PauseCircleOutlined: () => <span data-testid="pause-icon">⏸</span>,
  ReloadOutlined: () => <span data-testid="reload-icon">🔄</span>,
  StepForwardOutlined: () => <span data-testid="next-icon">⏭</span>
}));

describe('RobotController', () => {
  let mockProps;

  beforeEach(() => {
    mockProps = {
      ...mockRobotControllerProps,
      onToggleAnimation: vi.fn(),
      onReset: vi.fn(),
      onNextEpisode: vi.fn()
    };
  });

  describe('默认渲染', () => {
    it('应该返回null当没有指定渲染模式时', () => {
      const { container } = render(<RobotController {...mockProps} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('文本模式渲染 (renderTextOnly)', () => {
    it('应该显示正确的状态文本', () => {
      render(<RobotController {...mockProps} renderTextOnly={true} />);
      
      expect(screen.getByText(/Episode: 1/)).toBeInTheDocument();
      expect(screen.getByText(/帧数: 1 \/ 100/)).toBeInTheDocument();
    });

    it('应该显示无数据状态', () => {
      const noDataProps = {
        ...mockProps,
        motionDataLength: 0,
        currentEpisode: null
      };
      
      render(<RobotController {...noDataProps} renderTextOnly={true} />);
      
      expect(screen.getByText(/No Episode Selected/)).toBeInTheDocument();
      expect(screen.getByText(/帧数: N\/A/)).toBeInTheDocument();
    });

    it('应该显示正确的帧数信息', () => {
      const playingProps = {
        ...mockProps,
        ...mockAnimationStates.playing
      };
      
      render(<RobotController {...playingProps} renderTextOnly={true} />);
      
      expect(screen.getByText(/帧数: 26 \/ 100/)).toBeInTheDocument();
    });
  });

  describe('按钮模式渲染 (renderButtonsOnly)', () => {
    it('应该渲染所有控制按钮', () => {
      render(<RobotController {...mockProps} renderButtonsOnly={true} />);
      
      expect(screen.getByTestId('button-播放')).toBeInTheDocument();
      expect(screen.getByTestId('button-重置')).toBeInTheDocument();
      expect(screen.getByTestId('button-下一个')).toBeInTheDocument();
    });

    it('应该显示播放按钮当未播放时', () => {
      render(<RobotController {...mockProps} renderButtonsOnly={true} />);
      
      const playButton = screen.getByTestId('button-播放');
      expect(playButton).toBeInTheDocument();
      expect(screen.getByTestId('play-icon')).toBeInTheDocument();
    });

    it('应该显示暂停按钮当正在播放时', () => {
      const playingProps = {
        ...mockProps,
        isAnimating: true
      };
      
      render(<RobotController {...playingProps} renderButtonsOnly={true} />);
      
      const pauseButton = screen.getByTestId('button-暂停');
      expect(pauseButton).toBeInTheDocument();
      expect(screen.getByTestId('pause-icon')).toBeInTheDocument();
    });

    it('应该调用onToggleAnimation当点击播放/暂停按钮时', () => {
      render(<RobotController {...mockProps} renderButtonsOnly={true} />);
      
      const playButton = screen.getByTestId('button-播放');
      fireEvent.click(playButton);
      
      expect(mockProps.onToggleAnimation).toHaveBeenCalledTimes(1);
    });

    it('应该调用onReset当点击重置按钮时', () => {
      render(<RobotController {...mockProps} renderButtonsOnly={true} />);
      
      const resetButton = screen.getByTestId('button-重置');
      fireEvent.click(resetButton);
      
      expect(mockProps.onReset).toHaveBeenCalledTimes(1);
    });

    it('应该调用onNextEpisode当点击下一个按钮时', () => {
      render(<RobotController {...mockProps} renderButtonsOnly={true} />);
      
      const nextButton = screen.getByTestId('button-下一个');
      fireEvent.click(nextButton);
      
      expect(mockProps.onNextEpisode).toHaveBeenCalledTimes(1);
    });
  });

  describe('按钮禁用状态', () => {
    it('应该禁用所有按钮当没有运动数据时', () => {
      const noDataProps = {
        ...mockProps,
        motionDataLength: 0
      };
      
      render(<RobotController {...noDataProps} renderButtonsOnly={true} />);
      
      const playButton = screen.getByTestId('button-播放');
      const resetButton = screen.getByTestId('button-重置');
      const nextButton = screen.getByTestId('button-下一个');
      
      expect(playButton).toBeDisabled();
      expect(resetButton).toBeDisabled();
      expect(nextButton).toBeDisabled();
    });

    it('应该启用按钮当有运动数据时', () => {
      render(<RobotController {...mockProps} renderButtonsOnly={true} />);
      
      const playButton = screen.getByTestId('button-播放');
      const resetButton = screen.getByTestId('button-重置');
      const nextButton = screen.getByTestId('button-下一个');
      
      expect(playButton).not.toBeDisabled();
      expect(resetButton).not.toBeDisabled();
      expect(nextButton).not.toBeDisabled();
    });
  });

  describe('组合渲染模式', () => {
    it('应该同时渲染文本和按钮', () => {
      render(
        <div>
          <RobotController {...mockProps} renderTextOnly={true} />
          <RobotController {...mockProps} renderButtonsOnly={true} />
        </div>
      );
      
      expect(screen.getByText(/Episode: 1/)).toBeInTheDocument();
      expect(screen.getByTestId('button-播放')).toBeInTheDocument();
    });
  });

  describe('边界情况', () => {
    it('应该处理currentFrame为负数的情况', () => {
      const negativeFrameProps = {
        ...mockProps,
        currentFrame: -1
      };
      
      render(<RobotController {...negativeFrameProps} renderTextOnly={true} />);
      
      expect(screen.getByText(/帧数: 0 \/ 100/)).toBeInTheDocument();
    });

    it('应该处理currentFrame超过motionDataLength的情况', () => {
      const overflowFrameProps = {
        ...mockProps,
        currentFrame: 150,
        motionDataLength: 100
      };
      
      render(<RobotController {...overflowFrameProps} renderTextOnly={true} />);
      
      expect(screen.getByText(/帧数: 151 \/ 100/)).toBeInTheDocument();
    });
  });
}); 