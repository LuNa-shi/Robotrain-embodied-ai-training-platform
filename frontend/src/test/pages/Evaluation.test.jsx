// 文件路径: tests/pages/Evaluation.test.jsx

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import EvaluationPage from '@/pages/Evaluation';
import {
  mockRunningEvalTask,
  mockCompletedEvalTaskWithVideos,
  mockCompletedEvalTaskWithoutVideos,
  mockInitialEvalTasks,
  mockCompletedTrainProjects,
  mockEmptyTrainProjects,
  mockCreatedEvalTask,
  mockTrainTaskDetail,
  mockVideoBlob,
  mockDownloadResponse,
} from '../mocks/evaluationMocks'; // 假设的 mock 数据文件

// --- Mocks ---

// Mock API
vi.mock('@/utils/api', () => ({
  trainTasksAPI: {
    getCompletedTasks: vi.fn(),
    getById: vi.fn(),
  },
  evalTasksAPI: {
    getMyTasks: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    getVideo: vi.fn(),
    downloadVideo: vi.fn(),
  },
}));

// Mock WebSocket
const mockWebSocketInstance = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  onMessage: vi.fn(),
  onOpen: vi.fn(),
  onClose: vi.fn(),
  onError: vi.fn(),
  getStatus: vi.fn(() => 'Connected'),
  isConnected: vi.fn(() => true),
};
// 模拟 onMessage 的回调触发
let triggerWsOnMessage;
mockWebSocketInstance.onMessage.mockImplementation((callback) => {
  triggerWsOnMessage = callback;
});
vi.mock('@/utils/evalWebSocket', () => ({
  EvaluationStatusWebSocket: vi.fn(() => mockWebSocketInstance),
}));

// Mock React Router
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual();
  return { ...actual, useNavigate: () => mockNavigate };
});

// Mock antd App context (message, modal)
const mockMessage = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};
const mockModal = {
  confirm: vi.fn(),
};
vi.mock('antd', async (importOriginal) => {
    // 导入原始的 antd 模块
    const actual = await importOriginal();
    
    // 保持对 App.useApp 的 mock
    const MockApp = ({ children }) => children;
    MockApp.useApp = () => ({
        message: mockMessage,
        notification: vi.fn(),
        modal: mockModal,
    });

    // 保持对 Modal 的动画禁用 mock
    const RealModal = actual.Modal;
    const MockModalWithNoAnimation = (props) => (
        <RealModal {...props} transitionName="" maskTransitionName="" />
    );

    // 【全新实现】创建一个更真实的、有状态的 Dropdown mock
    const MockDropdown = ({ children, menu }) => {
        const [visible, setVisible] = React.useState(false);

        // 点击 children (即触发按钮) 时切换菜单可见性
        const handleToggle = (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            setVisible(!visible);
        };

        return (
            <div data-testid="mock-dropdown">
                {/* 为 children 包裹一个可点击的 div 来触发菜单 */}
                <div onClick={handleToggle}>
                    {children}
                </div>
                {/* 仅当 visible 为 true 时才渲染菜单 */}
                {visible && (
                    <div data-testid="mock-dropdown-menu">
                        {menu?.items?.map(item => {
                            // 如果是分隔符，则不处理点击
                            if (item.type === 'divider') {
                                return <hr key={item.key || Math.random()} />;
                            }
                            return (
                                <div
                                    key={item.key}
                                    onClick={() => {
                                        // 模拟菜单项点击
                                        if (item.onClick) {
                                            item.onClick();
                                        }
                                        // 点击后关闭菜单
                                        setVisible(false);
                                    }}
                                >
                                    {item.label}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return {
        ...actual,
        App: MockApp,
        Modal: MockModalWithNoAnimation,
        // 使用我们创建的、功能更完善的 Dropdown mock
        Dropdown: MockDropdown,
    };
});


// Mock antd Icons
vi.mock('@ant-design/icons', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        PlusOutlined: () => <span data-testid="icon-plus">Plus</span>,
        ExperimentOutlined: () => <span data-testid="icon-experiment">Experiment</span>,
        RobotOutlined: () => <span data-testid="icon-robot">Robot</span>,
        VideoCameraOutlined: () => <span data-testid="icon-video">Video</span>,
        DownloadOutlined: () => <span data-testid="icon-download">Download</span>,
        DeleteOutlined: () => <span data-testid="icon-delete">Delete</span>,
        ClockCircleOutlined: () => <span data-testid="icon-clock">Clock</span>,
        CheckCircleOutlined: () => <span data-testid="icon-check">Check</span>,
        CloseCircleOutlined: () => <span data-testid="icon-close">Close</span>,
    };
});


// --- Test Suite ---
describe('模型评估页面', () => {
  let user;
  let trainTasksAPI, evalTasksAPI;

  beforeEach(async () => {
    // Mock for layout checks and timers
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query) => ({ matches: false, media: query, addListener: vi.fn(), removeListener: vi.fn() }),
    });
    vi.useFakeTimers();
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    // Mock for video player
    window.URL.createObjectURL = vi.fn(() => 'mock-blob-url');
    window.URL.revokeObjectURL = vi.fn();


    // Clear all mocks before each test
    vi.clearAllMocks();

    const api = await import('@/utils/api');
    trainTasksAPI = api.trainTasksAPI;
    evalTasksAPI = api.evalTasksAPI;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper function to render the component
  const renderEvaluationPage = () => {
    return render(
      <BrowserRouter>
        <EvaluationPage />
      </BrowserRouter>
    );
  };

  describe('初始渲染与布局', () => {
    it('应正确渲染页面标题和描述', async () => {
      evalTasksAPI.getMyTasks.mockResolvedValue([]);
      trainTasksAPI.getCompletedTasks.mockResolvedValue([]);
      
      renderEvaluationPage();
      
      expect(await screen.findByRole('heading', { name: '模型评估' })).toBeInTheDocument();
      expect(screen.getByText('查看机器人模型的性能评估和仿真测试结果')).toBeInTheDocument();
    });

    it('在获取初始数据时应显示加载状态', async () => {
      evalTasksAPI.getMyTasks.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve([]), 100)));
      trainTasksAPI.getCompletedTasks.mockResolvedValue([]);

      renderEvaluationPage();
      
      expect(screen.getByText('加载评估任务中...')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByText('加载评估任务中...')).not.toBeInTheDocument();
      });
    });

    it('应默认进入“发起评估”模式并获取已完成的训练项目', async () => {
      evalTasksAPI.getMyTasks.mockResolvedValue([]);
      trainTasksAPI.getCompletedTasks.mockResolvedValue(mockCompletedTrainProjects);

      renderEvaluationPage();

      await waitFor(() => {
        expect(trainTasksAPI.getCompletedTasks).toHaveBeenCalledTimes(1);
      });
      expect(screen.getByText('选择已完成的训练项目进行评估')).toBeInTheDocument();
      expect(await screen.findByText(/训练项目 101/)).toBeInTheDocument();
    });

    it('应在左侧面板显示评估任务列表', async () => {
        evalTasksAPI.getMyTasks.mockResolvedValue(mockInitialEvalTasks);
        trainTasksAPI.getCompletedTasks.mockResolvedValue([]);
        renderEvaluationPage();

        expect(await screen.findByText('评估任务 1')).toBeInTheDocument();
        expect(screen.getByText('已完成')).toBeInTheDocument();
        expect(await screen.findByText('评估任务 2')).toBeInTheDocument();
        expect(screen.getByText('进行中')).toBeInTheDocument();
    });

    it('在没有已完成的训练项目可供评估时应显示空状态', async () => {
        evalTasksAPI.getMyTasks.mockResolvedValue([]);
        trainTasksAPI.getCompletedTasks.mockResolvedValue(mockEmptyTrainProjects);
        renderEvaluationPage();

        expect(await screen.findByText('暂无已完成的训练项目')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '开始训练' })).toBeInTheDocument();
    });
  });

  describe('用户交互与导航', () => {
    beforeEach(() => {
        evalTasksAPI.getMyTasks.mockResolvedValue(mockInitialEvalTasks);
        trainTasksAPI.getCompletedTasks.mockResolvedValue(mockCompletedTrainProjects);
    });

    it('点击“开始训练”按钮应跳转到 /training', async () => {
        trainTasksAPI.getCompletedTasks.mockResolvedValue(mockEmptyTrainProjects);
        renderEvaluationPage();
        
        const startTrainingButton = await screen.findByRole('button', { name: '开始训练' });
        await user.click(startTrainingButton);

        expect(mockNavigate).toHaveBeenCalledWith('/training');
    });

    it('点击一个评估任务应选中它并获取其详情', async () => {
        evalTasksAPI.getById.mockImplementation((id) => {
            if (id === '1') return Promise.resolve(mockCompletedEvalTaskWithVideos);
            if (id === '2') return Promise.resolve(mockRunningEvalTask);
            return Promise.resolve({});
        });
        trainTasksAPI.getById.mockResolvedValue(mockTrainTaskDetail);
        renderEvaluationPage();

        const taskItem = await screen.findByText('评估任务 1');
        await user.click(taskItem);

        await waitFor(() => {
            expect(evalTasksAPI.getById).toHaveBeenCalledWith('1');
        });
        await waitFor(() => {
            expect(trainTasksAPI.getById).toHaveBeenCalledWith(101);
        });

        // 检查右侧面板是否已更新为详情
        expect(await screen.findByText('评估视频 (2 个)')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /下载视频/ })).toBeInTheDocument();
    });

    it('点击“发起评估”项应切换到评估模式', async () => {
        evalTasksAPI.getById.mockResolvedValue(mockCompletedEvalTaskWithVideos);
        trainTasksAPI.getById.mockResolvedValue(mockTrainTaskDetail);
        renderEvaluationPage();
        
        // 1. 首先选择一个任务
        const taskItem = await screen.findByText('评估任务 1');
        await user.click(taskItem);
        expect(await screen.findByText('评估视频 (2 个)')).toBeInTheDocument();
        
        // 2. 然后点击“发起评估”
        const addProjectItem = screen.getByText('发起评估').closest('div');
        await user.click(addProjectItem);
        
        // 3. 验证是否已返回评估模式
        expect(await screen.findByText('选择已完成的训练项目进行评估')).toBeInTheDocument();
        expect(trainTasksAPI.getCompletedTasks).toHaveBeenCalledTimes(2); // 初始加载 + 本次点击
        expect(await screen.findByText(/训练项目 101/)).toBeInTheDocument();
    });
  });

  describe('发起新评估流程', () => {
     beforeEach(() => {
        // 确保每个测试都从干净的状态开始
        vi.clearAllMocks();
        evalTasksAPI.getMyTasks.mockResolvedValue([]);
        trainTasksAPI.getCompletedTasks.mockResolvedValue(mockCompletedTrainProjects);
        evalTasksAPI.create.mockResolvedValue(mockCreatedEvalTask);
     });

    it('点击训练项目时应打开评估阶段选择弹窗', async () => {
        renderEvaluationPage();
        
        const projectItem = await screen.findByText(/训练项目 101/);
        await user.click(projectItem);
        
        expect(await screen.findByRole('dialog', { name: /选择评估阶段/ })).toBeInTheDocument();
        expect(screen.getByText('已选择训练项目：')).toBeInTheDocument();
    });

    it('选择阶段后点击"发起评估"应开始评估流程', async () => {
        evalTasksAPI.getMyTasks.mockResolvedValueOnce([]).mockResolvedValueOnce([mockCreatedEvalTask]);
        renderEvaluationPage();

        const projectItem = await screen.findByText(/训练项目 101/);
        await user.click(projectItem);
        
        await screen.findByRole('dialog', { name: /选择评估阶段/ });
        
        // 【核心修改】不再通过 role='radio' 获取隐藏的 input，而是直接获取用户可见的文本标签
        const stageRadioButtonLabel = screen.getByText('50% 训练进度');
        
        const startButton = screen.getByRole('button', { name: '发起评估' });

        expect(startButton).toBeDisabled();
        
        // 点击可见的文本标签，这更符合用户行为，并能规避 input 自身的 pointer-events 问题
        await user.click(stageRadioButtonLabel);
        
        // 验证点击后，发起评估按钮变为可用
        expect(startButton).not.toBeDisabled();
        
        await user.click(startButton);
        
        // 验证API调用
        await waitFor(() => {
            expect(evalTasksAPI.create).toHaveBeenCalledWith({
                train_task_id: 101,
                eval_stage: 2,
            });
        });
        
        // 验证成功消息
        expect(mockMessage.success).toHaveBeenCalledWith('评估任务 3 创建成功！');
        
        // 验证弹窗关闭
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        // 验证任务列表更新
        await waitFor(() => {
            expect(evalTasksAPI.getMyTasks).toHaveBeenCalledTimes(2);
        });
        
        // 验证新任务出现在列表中
        expect(await screen.findByText('评估任务 3')).toBeInTheDocument();
    });
  });

  describe('评估详情、视频播放与删除功能', () => {
    beforeEach(() => {
        // 确保每个测试都从干净的状态开始
        vi.clearAllMocks();
        evalTasksAPI.getMyTasks.mockResolvedValue(mockInitialEvalTasks);
        trainTasksAPI.getCompletedTasks.mockResolvedValue([]);
        trainTasksAPI.getById.mockResolvedValue(mockTrainTaskDetail);
    });

    it('对于有视频的已完成任务应显示视频播放器', async () => {
        evalTasksAPI.getMyTasks.mockResolvedValue([mockCompletedEvalTaskWithVideos]);
        evalTasksAPI.getById.mockResolvedValue(mockCompletedEvalTaskWithVideos);
        evalTasksAPI.getVideo.mockResolvedValue(mockVideoBlob);
        trainTasksAPI.getById.mockResolvedValue(mockTrainTaskDetail);
    
        renderEvaluationPage();
        
        // 1. 点击任务项
        const taskItem = await screen.findByText((content, node) => node.textContent === '评估任务 1');
        await user.click(taskItem);
        
        // 2. 点击 "选择视频" 按钮来打开我们 mock 的 stateful Dropdown
        const dropdownTrigger = await screen.findByRole('button', { name: /选择视频/ });
        await user.click(dropdownTrigger);
    
        // 3. Dropdown 打开后，菜单项现在是可见的，可以被找到并成功点击
        const videoMenuItem = await screen.findByText('video1.mp4');
        await user.click(videoMenuItem);
        
        // 确认获取视频的 API 被正确调用
        await waitFor(() => {
            expect(evalTasksAPI.getVideo).toHaveBeenCalledWith(1, 'video1.mp4');
        });
        
        // 等待视频加载完成，然后确认 <video> 标签已渲染
        await waitFor(() => {
            expect(screen.getByTestId('video-player')).toBeInTheDocument();
        });
        
        const videoPlayer = screen.getByTestId('video-player');
        
        // 确认视频源和当前播放名称正确
        expect(videoPlayer.querySelector('source').src).toContain('mock-blob-url');
        expect(screen.getByText('当前播放: video1.mp4')).toBeInTheDocument();
    });

    it('对于没有视频的已完成任务应显示占位提示', async () => {
        // 为本测试覆盖特定的 mock
        evalTasksAPI.getMyTasks.mockResolvedValue([mockCompletedEvalTaskWithoutVideos]);
        evalTasksAPI.getById.mockResolvedValue(mockCompletedEvalTaskWithoutVideos);
        
        renderEvaluationPage();

        await user.click(await screen.findByText('评估任务 1'));
        expect(await screen.findByText('暂无评估视频')).toBeInTheDocument();
    });

    it('应允许删除一个评估任务', async () => {
        // 为本测试覆盖特定的 mock
        evalTasksAPI.getMyTasks.mockResolvedValue([mockCompletedEvalTaskWithVideos]);
        evalTasksAPI.getById.mockResolvedValue(mockCompletedEvalTaskWithVideos);
        evalTasksAPI.delete.mockResolvedValue({ success: true });
        
        // 模拟删除后的API调用
        evalTasksAPI.getMyTasks.mockResolvedValueOnce([mockCompletedEvalTaskWithVideos]).mockResolvedValueOnce([]);

        mockModal.confirm.mockImplementation(config => {
          if (config.onOk) config.onOk();
        });

        renderEvaluationPage();
        await user.click(await screen.findByText('评估任务 1'));
        
        const deleteButton = await screen.findByRole('button', { name: /删除/ });
        await user.click(deleteButton);
        
        expect(mockModal.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '确认删除' }));
        
        await waitFor(() => {
            expect(evalTasksAPI.delete).toHaveBeenCalledWith(1);
        });

        expect(mockMessage.success).toHaveBeenCalledWith('评估任务删除成功！');
        
        await waitFor(() => {
            expect(evalTasksAPI.getMyTasks).toHaveBeenCalledTimes(2);
        });
        expect(await screen.findByText('选择已完成的训练项目进行评估')).toBeInTheDocument();
    });
  });

  describe('WebSocket 功能', () => {
    it('应为运行中的任务建立WebSocket连接并在收到消息时更新状态', async () => {
        evalTasksAPI.getMyTasks.mockResolvedValue(mockInitialEvalTasks); // 包含运行中的任务 '2'
        trainTasksAPI.getCompletedTasks.mockResolvedValue([]);
        evalTasksAPI.getById.mockImplementation((id) => {
            if (id === 1 || id === '1') return Promise.resolve(mockCompletedEvalTaskWithVideos);
            if (id === 2 || id === '2') return Promise.resolve(mockRunningEvalTask);
            return Promise.resolve({});
        });
        renderEvaluationPage();

        // 检查是否为运行中的任务创建了 WebSocket
        await waitFor(() => {
            expect(mockWebSocketInstance.connect).toHaveBeenCalledWith(2);
        });

        // 列表初始应显示“进行中”
        expect(screen.getByText('进行中')).toBeInTheDocument();
        
        // 模拟一个 WS 消息，并 mock 随后的 API 调用来展示更新
        const updatedTask = { ...mockRunningEvalTask, status: 'completed' };
        evalTasksAPI.getById.mockResolvedValue(updatedTask);

        // 这将触发 onMessage 回调
        await act(async () => {
            await triggerWsOnMessage(JSON.stringify({ status: 'update' }));
        });

        await waitFor(() => {
            expect(evalTasksAPI.getById).toHaveBeenCalledWith(2);
        });

        // 列表状态应更新为“已完成”
        // 现在我们预期有两个“已完成”标签
        expect(await screen.findAllByText('已完成')).toHaveLength(2);
        expect(screen.queryByText('进行中')).not.toBeInTheDocument();
        
        // WebSocket 连接应被断开
        expect(mockWebSocketInstance.disconnect).toHaveBeenCalled();
        expect(mockMessage.success).toHaveBeenCalledWith(`评估任务 2 已完成！`);
    });

    it('如果被更新的任务当前正被选中，应更新右侧的详情面板', async () => {
        evalTasksAPI.getMyTasks.mockResolvedValue([mockRunningEvalTask]);
        trainTasksAPI.getCompletedTasks.mockResolvedValue([]);
        evalTasksAPI.getById.mockResolvedValue(mockRunningEvalTask); // 初始选择
        trainTasksAPI.getById.mockResolvedValue(mockTrainTaskDetail);
        
        renderEvaluationPage();

        // 选择那个运行中的任务
        await user.click(await screen.findByText('评估任务 2'));

        // 初始时，它显示“进行中”的消息
        expect(await screen.findByText(/当前状态（running）暂不支持显示仿真和视频/)).toBeInTheDocument();

        // 模拟一个 WS 消息 -> 任务现在已完成且带有视频
        const updatedTaskDetail = { ...mockRunningEvalTask, status: 'completed', video_names: ['final_video.mp4'] };
        evalTasksAPI.getById.mockResolvedValue(updatedTaskDetail);

        await act(async () => {
            await triggerWsOnMessage(JSON.stringify({ status: 'update' }));
        });

        // 右侧面板应更新以显示视频 UI
        await waitFor(() => {
            expect(screen.queryByText(/当前状态（running）/)).not.toBeInTheDocument();
        });
        expect(await screen.findByText('评估视频 (1 个)')).toBeInTheDocument();
    });
  });
});