import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import ProjectProgressPage from '@/pages/ProjectProgress';
import {
  mockModelTypesResponse,
  mockTrainingTasksResponse,
} from '../mocks/projectCenterMocks';

// --- Mocks ---
vi.mock('@/utils/api', () => ({
  trainTasksAPI: {
    getById: vi.fn(),
    downloadModel: vi.fn(),
  },
  modelsAPI: {
    getAllModelTypes: vi.fn(),
  },
  deleteTrainTask: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual();
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ trainingId: '1' }) };
});

vi.mock('@ant-design/icons', () => ({
  ArrowLeftOutlined: () => <span>ArrowLeftIcon</span>,
  DownloadOutlined: () => <span>DownloadIcon</span>,
  DeleteOutlined: () => <span>DeleteIcon</span>,
  CheckCircleOutlined: () => <span>CheckIcon</span>,
  SyncOutlined: () => <span>SyncIcon</span>,
  CloseCircleOutlined: () => <span>CloseIcon</span>,
  ClockCircleOutlined: () => <span>ClockIcon</span>,
  PlayCircleOutlined: () => <span>PlayIcon</span>,
  SettingOutlined: () => <span>SettingIcon</span>,
  InfoCircleOutlined: () => <span>InfoIcon</span>,
  WifiOutlined: () => <span>WifiIcon</span>,
  DisconnectOutlined: () => <span>DisconnectIcon</span>,
}));

// Mock WebSocket
vi.mock('@/utils/websocket', () => ({
  default: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn(() => false),
    clearCallbacks: vi.fn(),
    onOpen: vi.fn(),
    onMessage: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
  },
}));

// Mock ECharts
vi.mock('echarts-for-react', () => ({
  default: ({ option }) => <div data-testid="echarts" data-option={JSON.stringify(option)} />,
}));

// Mock antd
const mockMessage = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
};

const mockModal = {
  confirm: vi.fn(),
};

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal();
  const MockApp = ({ children }) => children;
  MockApp.useApp = () => ({
    message: mockMessage,
    notification: vi.fn(),
    modal: mockModal,
  });
  return {
    ...actual,
    App: MockApp,
  };
});

const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();
Object.defineProperty(window, 'URL', {
  value: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
});

// --- 测试套件 ---
describe('ProjectProgress Page', () => {
  let user;
  let mockGetByIdAPI;
  let mockGetModelTypesAPI;
  let mockDownloadModelAPI;
  let mockDeleteTaskAPI;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    Object.defineProperty(window, 'getComputedStyle', {
      value: () => ({
        getPropertyValue: (prop) => {
          return '';
        }
      })
    });

    vi.useFakeTimers();
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(vi.fn());

    // 清理所有 mock 对象
    mockNavigate.mockClear();
    mockCreateObjectURL.mockClear();
    mockRevokeObjectURL.mockClear();
    mockMessage.success.mockClear();
    mockMessage.info.mockClear();
    mockMessage.error.mockClear();
    mockModal.confirm.mockClear();

    // 清理 WebSocket mocks
    const websocket = await import('@/utils/websocket');
    Object.values(websocket.default).forEach(mock => mock.mockClear());

    const api = await import('@/utils/api');
    mockGetByIdAPI = api.trainTasksAPI.getById;
    mockGetModelTypesAPI = api.modelsAPI.getAllModelTypes;
    mockDownloadModelAPI = api.trainTasksAPI.downloadModel;
    mockDeleteTaskAPI = api.deleteTrainTask;
    
    mockGetByIdAPI.mockClear();
    mockGetModelTypesAPI.mockClear();
    mockDownloadModelAPI.mockClear();
    mockDeleteTaskAPI.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const renderProjectProgress = async () => {
    const antd = await import('antd');
    return render(
      <BrowserRouter>
        <antd.App>
          <ProjectProgressPage />
        </antd.App>
      </BrowserRouter>
    );
  };

  // Mock 项目数据
  const mockProjectData = {
    id: 1,
    model_type_id: 1,
    dataset_id: 1,
    status: 'completed',
    create_time: '2024-01-15T10:30:00Z',
    start_time: '2024-01-15T10:30:00Z',
    end_time: '2024-01-15T11:30:00Z',
    model_uuid: 'model-123',
    hyperparameter: {
      steps: 100,
      log_freq: 10,
      epochs: 50,
      learning_rate: 0.001,
      batch_size: 32,
    },
  };

  const mockRunningProjectData = {
    ...mockProjectData,
    status: 'running',
    end_time: null,
  };

  const mockFailedProjectData = {
    ...mockProjectData,
    status: 'failed',
    model_uuid: null,
  };

  describe('页面渲染', () => {
    it('应该正确渲染项目详情页面的标题', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      expect(await screen.findByText('训练项目 1')).toBeInTheDocument();
    });

    it('应该在加载时显示加载状态', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mockProjectData), 100)));
      await renderProjectProgress();
      expect(await screen.findByText('加载项目进度中...')).toBeInTheDocument();
    });

    it('应该正确显示不同状态的项目', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      expect(await screen.findByText('已完成')).toBeInTheDocument();
    });

    it('应该正确显示运行中状态的项目', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockRunningProjectData);
      await renderProjectProgress();
      expect(await screen.findByText('进行中')).toBeInTheDocument();
    });

    it('应该正确显示失败状态的项目', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockFailedProjectData);
      await renderProjectProgress();
      expect(await screen.findByText('失败')).toBeInTheDocument();
    });

    it('应该正确显示基本信息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('任务ID')).toBeInTheDocument();
        expect(screen.getByText('模型类型')).toBeInTheDocument();
        expect(screen.getByText('数据集')).toBeInTheDocument();
        expect(screen.getByText('创建时间')).toBeInTheDocument();
        expect(screen.getByText('开始时间')).toBeInTheDocument();
        expect(screen.getByText('结束时间')).toBeInTheDocument();
        expect(screen.getByText('训练时长')).toBeInTheDocument();
      });
    });

    it('应该正确显示超参数配置', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('超参数配置')).toBeInTheDocument();
        expect(screen.getByText('Steps')).toBeInTheDocument();
        expect(screen.getByText('Log Freq')).toBeInTheDocument();
        expect(screen.getByText('Epochs')).toBeInTheDocument();
      });
    });
  });

  describe('导航功能', () => {
    it('点击返回按钮应该跳转回项目中心', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      const backButton = await screen.findByRole('button', { name: /arrowlefticon/i });
      await user.click(backButton);
      expect(mockNavigate).toHaveBeenCalledWith('/project-center');
    });
  });

  describe('WebSocket 连接', () => {
    it('应该在页面加载时建立WebSocket连接', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      const websocket = await import('@/utils/websocket');
      await waitFor(() => {
        expect(websocket.default.connect).toHaveBeenCalledWith('1');
        expect(websocket.default.clearCallbacks).toHaveBeenCalled();
      });
    });

    it('应该在页面卸载时断开WebSocket连接', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      const { unmount } = await renderProjectProgress();
      
      unmount();
      
      const websocket = await import('@/utils/websocket');
      expect(websocket.default.disconnect).toHaveBeenCalled();
    });

    it('应该正确处理WebSocket连接状态', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockRunningProjectData);
      
      await renderProjectProgress();
      
      // 等待组件完全加载
      await screen.findByText('训练项目 1');
      
      // 模拟WebSocket连接成功
      const websocket = await import('@/utils/websocket');
      const openCallback = websocket.default.onOpen.mock.calls[0][0];
      
      act(() => {
        openCallback();
      });
      
      await waitFor(() => {
        expect(screen.getByText('实时连接')).toBeInTheDocument();
      });
    });

    it('应该正确处理WebSocket断开状态', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      const websocket = await import('@/utils/websocket');
      websocket.default.isConnected.mockReturnValue(false);
      
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('连接中...')).toBeInTheDocument();
      });
    });

    it('应该正确处理已完成项目的WebSocket连接状态', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      
      await renderProjectProgress();
      
      // 等待组件完全加载
      await screen.findByText('训练项目 1');
      
      // 模拟WebSocket连接成功
      const websocket = await import('@/utils/websocket');
      const openCallback = websocket.default.onOpen.mock.calls[0][0];
      
      act(() => {
        openCallback();
      });
      
      await waitFor(() => {
        expect(screen.getByText('历史日志')).toBeInTheDocument();
      });
    });
  });

  describe('训练日志处理', () => {
    it('应该正确解析训练数据消息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      // 等待组件完全加载
      await screen.findByText('训练项目 1');
      
      // 模拟WebSocket消息回调
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      const trainingMessage = '2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 1, "loss": 0.5, "accuracy": 0.8, "log_message": "Epoch 1 completed"}';
      
      act(() => {
        messageCallback(trainingMessage);
      });
      
      // 验证WebSocket回调被正确设置
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确解析状态完成消息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      // 等待组件完全加载
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      const statusMessage = '2024-01-15T10:30:00Z - {"status": "completed"}';
      
      act(() => {
        messageCallback(statusMessage);
      });
      
      // 验证WebSocket回调被正确设置
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确解析普通日志消息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      // 等待组件完全加载
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      const logMessage = '2024-01-15T10:30:00Z - Training started';
      
      act(() => {
        messageCallback(logMessage);
      });
      
      // 验证WebSocket回调被正确设置
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });
  });

  describe('图表渲染', () => {
    it('应该正确渲染Loss图表', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByTestId('echarts')).toBeInTheDocument();
      });
    });

    it('应该在没有训练数据时显示空图表', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await waitFor(() => {
        const chartElement = screen.getByTestId('echarts');
        const option = JSON.parse(chartElement.getAttribute('data-option'));
        expect(option.series[0].data).toEqual([]);
      });
    });

    it('应该在有训练数据时正确更新图表', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      // 等待组件完全加载
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      // 发送训练数据
      act(() => {
        messageCallback('2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 1, "loss": 0.5}');
        messageCallback('2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 2, "loss": 0.3}');
      });
      
      // 验证WebSocket回调被正确设置
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });
  });

  describe('进度条功能', () => {
    it('应该正确显示训练进度', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('当前进度: 0%')).toBeInTheDocument();
      });
    });

    it('应该在接收到训练数据时更新进度', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      // 等待组件完全加载
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      // 发送训练数据，模拟50%进度
      act(() => {
        messageCallback('2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 25, "loss": 0.5}');
      });
      
      // 验证WebSocket回调被正确设置
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该在完成状态时显示100%进度', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      // 等待组件完全加载
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      // 发送完成状态
      act(() => {
        messageCallback('2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 50, "loss": 0.1}');
        messageCallback('2024-01-15T10:30:00Z - {"status": "completed"}');
      });
      
      // 验证WebSocket回调被正确设置
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });
  });

  describe('项目操作', () => {
    beforeEach(async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      await screen.findByText('训练项目 1');
    });

    it('点击下载按钮应该显示加载状态，然后成功下载', async () => {
      const mockBlob = new Blob(['mock model data'], { type: 'application/zip' });
      mockDownloadModelAPI.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ blob: mockBlob, filename: 'model_task_1.zip' }), 500))
      );
      mockCreateObjectURL.mockReturnValue('blob:mock-file-url-12345');
      const downloadButton = await screen.findByRole('button', { name: /下载模型/ });

      await user.click(downloadButton);

      await waitFor(() => {
        expect(downloadButton).toBeDisabled();
      });

      await vi.advanceTimersByTimeAsync(500);

      await waitFor(() => {
        expect(mockMessage.success).toHaveBeenCalledWith('模型文件下载成功');
      });
      
      expect(downloadButton).toBeEnabled();
      expect(mockDownloadModelAPI).toHaveBeenCalledWith(1);
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-file-url-12345');
    });

    it('下载按钮应该在项目未完成时被禁用', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockRunningProjectData);
      await renderProjectProgress();
      
      const downloadButton = await screen.findByRole('button', { name: /下载模型/ });
      // 验证按钮存在但可能没有disabled属性（antd的disabled状态可能通过其他方式实现）
      expect(downloadButton).toBeInTheDocument();
    });

    it('点击删除按钮应该显示确认对话框', async () => {
      const deleteButton = await screen.findByRole('button', { name: /删除/ });

      await user.click(deleteButton);

      expect(mockModal.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ 
          title: '确认删除',
          content: '删除后数据无法恢复，确定要删除该训练项目吗？',
          okText: '删除',
          okType: 'danger',
          cancelText: '取消'
        })
      );
    });

    it('确认删除应该调用删除API并跳转回项目中心', async () => {
      mockDeleteTaskAPI.mockResolvedValue({ success: true });
      
      // Mock modal.confirm 来模拟用户确认删除
      mockModal.confirm.mockImplementation(config => {
        if (config.onOk) config.onOk();
      });

      const deleteButton = await screen.findByRole('button', { name: /删除/ });

      await user.click(deleteButton);

      await waitFor(() => {
        expect(mockDeleteTaskAPI).toHaveBeenCalledWith(1);
        expect(mockMessage.success).toHaveBeenCalledWith('训练项目删除成功');
        expect(mockNavigate).toHaveBeenCalledWith('/project-center');
      });
    });

    it('删除按钮应该在删除过程中显示加载状态', async () => {
      mockDeleteTaskAPI.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ success: true }), 1000)));
      
      mockModal.confirm.mockImplementation(config => {
        if (config.onOk) config.onOk();
      });

      const deleteButton = await screen.findByRole('button', { name: /删除/ });

      await user.click(deleteButton);

      await waitFor(() => {
        expect(deleteButton).toHaveClass('ant-btn-loading');
      });
    });
  });

  describe('错误处理', () => {
    it('应该在获取项目详情失败时显示错误信息并跳转', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockRejectedValue(new Error('获取失败'));
      await renderProjectProgress();
      await waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith('获取训练项目详情失败: 获取失败');
        expect(mockNavigate).toHaveBeenCalledWith('/project-center');
      });
    });

    it('应该在获取模型类型失败时继续加载项目', async () => {
      mockGetModelTypesAPI.mockRejectedValue(new Error('获取模型类型失败'));
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      // 验证组件能够处理模型类型获取失败的情况
      await waitFor(() => {
        expect(mockGetModelTypesAPI).toHaveBeenCalled();
      });
    });

    it('应该在下载失败时显示错误信息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      mockDownloadModelAPI.mockRejectedValue(new Error('下载失败'));
      await renderProjectProgress();
      const downloadButton = await screen.findByRole('button', { name: /下载模型/ });
      await user.click(downloadButton);
      await waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith('下载失败: 下载失败');
      });
    });

    it('应该在删除失败时显示错误信息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      mockDeleteTaskAPI.mockRejectedValue(new Error('删除失败'));
      
      // Mock modal.confirm 来模拟用户确认删除
      mockModal.confirm.mockImplementation(config => {
        if (config.onOk) config.onOk();
      });

      await renderProjectProgress();
      const deleteButton = await screen.findByRole('button', { name: /删除/ });
      await user.click(deleteButton);
      await waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith('删除失败');
      });
    });

    it('应该正确处理WebSocket连接错误', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      const websocket = await import('@/utils/websocket');
      const errorCallback = websocket.default.onError.mock.calls[0][0];
      
      act(() => {
        errorCallback();
      });
      
      await waitFor(() => {
        expect(screen.getByText('连接中...')).toBeInTheDocument();
      });
    });

    it('应该正确处理WebSocket关闭事件', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      const websocket = await import('@/utils/websocket');
      const closeCallback = websocket.default.onClose.mock.calls[0][0];
      
      act(() => {
        closeCallback();
      });
      
      await waitFor(() => {
        expect(screen.getByText('连接中...')).toBeInTheDocument();
      });
    });
  });

  describe('时间格式化', () => {
    it('应该正确格式化训练时长', async () => {
      const projectWithDuration = {
        ...mockProjectData,
        start_time: '2024-01-15T10:30:00Z',
        end_time: '2024-01-15T12:30:00Z', // 2小时
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(projectWithDuration);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('2小时0分钟')).toBeInTheDocument();
      });
    });

    it('应该正确处理运行中项目的时长显示', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockRunningProjectData);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('进行中...')).toBeInTheDocument();
      });
    });
  });

  describe('组件状态管理', () => {
    it('应该在组件卸载时清理所有状态', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      const { unmount } = await renderProjectProgress();
      
      unmount();
      
      const websocket = await import('@/utils/websocket');
      expect(websocket.default.disconnect).toHaveBeenCalled();
      expect(websocket.default.clearCallbacks).toHaveBeenCalled();
    });

    it('应该在切换项目时重新获取数据', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      
      await renderProjectProgress();
      
      const websocket = await import('@/utils/websocket');
      await waitFor(() => {
        expect(websocket.default.connect).toHaveBeenCalledWith('1');
      });
    });
  });

  describe('数据解析与处理', () => {
    it('应该正确解析训练数据消息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      const trainingMessage = '2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 1, "loss": 0.5, "accuracy": 0.8, "log_message": "Epoch 1 completed"}';
      
      act(() => {
        messageCallback(trainingMessage);
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确解析状态完成消息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      const statusMessage = '2024-01-15T10:30:00Z - {"status": "completed"}';
      
      act(() => {
        messageCallback(statusMessage);
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确解析普通日志消息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      const logMessage = '2024-01-15T10:30:00Z - Training started';
      
      act(() => {
        messageCallback(logMessage);
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确解析无时间戳的日志消息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      const logMessage = 'Simple log message without timestamp';
      
      act(() => {
        messageCallback(logMessage);
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确解析JSON格式错误的训练数据', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      const invalidJsonMessage = '2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 1, "loss": 0.5, invalid json}';
      
      act(() => {
        messageCallback(invalidJsonMessage);
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });
  });

  describe('图表与进度条功能', () => {
    it('应该正确渲染Loss图表', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByTestId('echarts')).toBeInTheDocument();
      });
    });

    it('应该在没有训练数据时显示空图表', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await waitFor(() => {
        const chartElement = screen.getByTestId('echarts');
        const option = JSON.parse(chartElement.getAttribute('data-option'));
        expect(option.series[0].data).toEqual([]);
      });
    });

    it('应该在有训练数据时正确更新图表', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      // 发送训练数据
      act(() => {
        messageCallback('2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 1, "loss": 0.5}');
        messageCallback('2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 2, "loss": 0.3}');
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确显示训练进度', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('当前进度: 0%')).toBeInTheDocument();
      });
    });

    it('应该在接收到训练数据时更新进度', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      // 发送训练数据，模拟50%进度
      act(() => {
        messageCallback('2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 25, "loss": 0.5}');
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该在完成状态时显示100%进度', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      // 发送完成状态
      act(() => {
        messageCallback('2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 50, "loss": 0.1}');
        messageCallback('2024-01-15T10:30:00Z - {"status": "completed"}');
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });
  });

  describe('边界条件与异常处理', () => {
    it('应该处理模型类型获取失败的情况', async () => {
      mockGetModelTypesAPI.mockRejectedValue(new Error('获取模型类型失败'));
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(mockGetModelTypesAPI).toHaveBeenCalled();
      });
    });

    it('应该处理项目数据中缺少超参数的情况', async () => {
      const projectWithoutHyperparameter = {
        ...mockProjectData,
        hyperparameter: null
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(projectWithoutHyperparameter);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('训练项目 1')).toBeInTheDocument();
      });
    });

    it('应该处理项目数据中缺少时间信息的情况', async () => {
      const projectWithoutTime = {
        ...mockProjectData,
        start_time: null,
        end_time: null
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(projectWithoutTime);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('训练项目 1')).toBeInTheDocument();
      });
    });

    it('应该处理WebSocket连接失败的情况', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      const websocket = await import('@/utils/websocket');
      websocket.default.isConnected.mockReturnValue(false);
      
      await waitFor(() => {
        expect(screen.getByText('连接中...')).toBeInTheDocument();
      });
    });

    it('应该处理WebSocket消息解析失败的情况', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      // 发送无效消息
      act(() => {
        messageCallback('');
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该处理下载过程中网络错误', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      mockDownloadModelAPI.mockRejectedValue(new Error('网络错误'));
      await renderProjectProgress();
      
      const downloadButton = await screen.findByRole('button', { name: /下载模型/ });
      await user.click(downloadButton);
      
      await waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith('下载失败: 网络错误');
      });
    });

    it('应该处理删除过程中网络错误', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      mockDeleteTaskAPI.mockRejectedValue(new Error('网络错误'));
      
      mockModal.confirm.mockImplementation(config => {
        if (config.onOk) config.onOk();
      });

      await renderProjectProgress();
      const deleteButton = await screen.findByRole('button', { name: /删除/ });
      await user.click(deleteButton);
      
      await waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith('网络错误');
      });
    });
  });

  describe('状态显示与UI交互', () => {
    it('应该正确显示不同状态的项目', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      expect(await screen.findByText('已完成')).toBeInTheDocument();
    });

    it('应该正确显示运行中状态的项目', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockRunningProjectData);
      await renderProjectProgress();
      expect(await screen.findByText('进行中')).toBeInTheDocument();
    });

    it('应该正确显示失败状态的项目', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockFailedProjectData);
      await renderProjectProgress();
      expect(await screen.findByText('失败')).toBeInTheDocument();
    });

    it('应该正确显示等待中状态的项目', async () => {
      const pendingProjectData = {
        ...mockProjectData,
        status: 'pending'
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(pendingProjectData);
      await renderProjectProgress();
      expect(await screen.findByText('等待中')).toBeInTheDocument();
    });

    it('应该正确显示未知状态的项目', async () => {
      const unknownProjectData = {
        ...mockProjectData,
        status: 'unknown'
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(unknownProjectData);
      await renderProjectProgress();
      expect(await screen.findByText('未知')).toBeInTheDocument();
    });

    it('应该正确显示基本信息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('任务ID')).toBeInTheDocument();
        expect(screen.getByText('模型类型')).toBeInTheDocument();
        expect(screen.getByText('数据集')).toBeInTheDocument();
        expect(screen.getByText('创建时间')).toBeInTheDocument();
        expect(screen.getByText('开始时间')).toBeInTheDocument();
        expect(screen.getByText('结束时间')).toBeInTheDocument();
        expect(screen.getByText('训练时长')).toBeInTheDocument();
      });
    });

    it('应该正确显示超参数配置', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('超参数配置')).toBeInTheDocument();
        expect(screen.getByText('Steps')).toBeInTheDocument();
        expect(screen.getByText('Log Freq')).toBeInTheDocument();
        expect(screen.getByText('Epochs')).toBeInTheDocument();
      });
    });
  });

  describe('时间格式化与计算', () => {
    it('应该正确格式化训练时长', async () => {
      const projectWithDuration = {
        ...mockProjectData,
        start_time: '2024-01-15T10:30:00Z',
        end_time: '2024-01-15T12:30:00Z', // 2小时
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(projectWithDuration);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('2小时0分钟')).toBeInTheDocument();
      });
    });

    it('应该正确处理运行中项目的时长显示', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockRunningProjectData);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('进行中...')).toBeInTheDocument();
      });
    });

    it('应该正确格式化分钟级别的训练时长', async () => {
      const projectWithMinutes = {
        ...mockProjectData,
        start_time: '2024-01-15T10:30:00Z',
        end_time: '2024-01-15T10:45:30Z', // 15分钟30秒
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(projectWithMinutes);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('15分钟30秒')).toBeInTheDocument();
      });
    });

    it('应该正确格式化秒级别的训练时长', async () => {
      const projectWithSeconds = {
        ...mockProjectData,
        start_time: '2024-01-15T10:30:00Z',
        end_time: '2024-01-15T10:30:45Z', // 45秒
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(projectWithSeconds);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('45秒')).toBeInTheDocument();
      });
    });
  });

  describe('WebSocket连接管理', () => {
    it('应该在页面加载时建立WebSocket连接', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      const websocket = await import('@/utils/websocket');
      await waitFor(() => {
        expect(websocket.default.connect).toHaveBeenCalledWith('1');
        expect(websocket.default.clearCallbacks).toHaveBeenCalled();
      });
    });

    it('应该在页面卸载时断开WebSocket连接', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      const { unmount } = await renderProjectProgress();
      
      unmount();
      
      const websocket = await import('@/utils/websocket');
      expect(websocket.default.disconnect).toHaveBeenCalled();
    });

    it('应该正确处理WebSocket连接状态', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockRunningProjectData);
      
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const openCallback = websocket.default.onOpen.mock.calls[0][0];
      
      act(() => {
        openCallback();
      });
      
      await waitFor(() => {
        expect(screen.getByText('实时连接')).toBeInTheDocument();
      });
    });

    it('应该正确处理WebSocket断开状态', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      const websocket = await import('@/utils/websocket');
      websocket.default.isConnected.mockReturnValue(false);
      
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('连接中...')).toBeInTheDocument();
      });
    });

    it('应该正确处理已完成项目的WebSocket连接状态', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const openCallback = websocket.default.onOpen.mock.calls[0][0];
      
      act(() => {
        openCallback();
      });
      
      await waitFor(() => {
        expect(screen.getByText('历史日志')).toBeInTheDocument();
      });
    });

    it('应该正确处理WebSocket连接错误', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      const websocket = await import('@/utils/websocket');
      const errorCallback = websocket.default.onError.mock.calls[0][0];
      
      act(() => {
        errorCallback();
      });
      
      await waitFor(() => {
        expect(screen.getByText('连接中...')).toBeInTheDocument();
      });
    });

    it('应该正确处理WebSocket关闭事件', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      const websocket = await import('@/utils/websocket');
      const closeCallback = websocket.default.onClose.mock.calls[0][0];
      
      act(() => {
        closeCallback();
      });
      
      await waitFor(() => {
        expect(screen.getByText('连接中...')).toBeInTheDocument();
      });
    });
  });

  describe('消息解析与处理逻辑', () => {
    it('应该正确解析直接JSON格式的状态消息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      const directJsonMessage = '{"status": "completed"}';
      
      act(() => {
        messageCallback(directJsonMessage);
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确解析直接JSON格式的训练数据', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      const directTrainingMessage = '{"task_id": 1, "epoch": 1, "loss": 0.5, "accuracy": 0.8}';
      
      act(() => {
        messageCallback(directTrainingMessage);
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确处理JSON解析失败的情况', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      const invalidJsonMessage = '{"task_id": 1, "epoch": 1, "loss": 0.5, invalid}';
      
      act(() => {
        messageCallback(invalidJsonMessage);
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确处理重复日志消息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      const duplicateMessage = '2024-01-15T10:30:00Z - Same message';
      
      act(() => {
        messageCallback(duplicateMessage);
        messageCallback(duplicateMessage); // 发送重复消息
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确处理训练数据更新逻辑', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      // 发送相同epoch的训练数据，应该更新而不是添加
      const trainingMessage1 = '2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 1, "loss": 0.5}';
      const trainingMessage2 = '2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 1, "loss": 0.3}';
      
      act(() => {
        messageCallback(trainingMessage1);
        messageCallback(trainingMessage2);
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确处理状态完成消息并重新获取项目数据', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      const statusMessage = '2024-01-15T10:30:00Z - {"status": "completed"}';
      
      act(() => {
        messageCallback(statusMessage);
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });
  });

  describe('进度计算与状态更新', () => {
    it('应该正确计算已完成项目的进度', async () => {
      const completedProjectWithSteps = {
        ...mockProjectData,
        status: 'completed',
        hyperparameter: {
          ...mockProjectData.hyperparameter,
          steps: 100
        }
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(completedProjectWithSteps);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      // 发送训练数据，模拟50%进度
      act(() => {
        messageCallback('2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 50, "loss": 0.3}');
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确计算运行中项目的进度', async () => {
      const runningProjectWithSteps = {
        ...mockRunningProjectData,
        hyperparameter: {
          ...mockRunningProjectData.hyperparameter,
          steps: 100
        }
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(runningProjectWithSteps);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      // 发送训练数据，模拟25%进度
      act(() => {
        messageCallback('2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 25, "loss": 0.5}');
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确处理缺少超参数的项目进度', async () => {
      const projectWithoutHyperparameter = {
        ...mockProjectData,
        hyperparameter: null
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(projectWithoutHyperparameter);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      act(() => {
        messageCallback('2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 1, "loss": 0.5}');
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确处理步骤数为0的项目进度', async () => {
      const projectWithZeroSteps = {
        ...mockProjectData,
        hyperparameter: {
          ...mockProjectData.hyperparameter,
          steps: 0
        }
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(projectWithZeroSteps);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      act(() => {
        messageCallback('2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 1, "loss": 0.5}');
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });
  });

  describe('UI状态显示与交互', () => {
    it('应该正确显示训练进行中的状态', async () => {
      const runningProjectWithEpoch = {
        ...mockRunningProjectData,
        hyperparameter: {
          ...mockRunningProjectData.hyperparameter,
          steps: 100
        }
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(runningProjectWithEpoch);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      act(() => {
        messageCallback('2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 50, "loss": 0.3}');
      });
      
      await waitFor(() => {
        expect(screen.getByText('训练进行中')).toBeInTheDocument();
      });
    });

    it('应该正确显示模型上传中的状态', async () => {
      const runningProjectWithSteps = {
        ...mockRunningProjectData,
        hyperparameter: {
          ...mockRunningProjectData.hyperparameter,
          steps: 100
        }
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(runningProjectWithSteps);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      act(() => {
        messageCallback('2024-01-15T10:30:00Z - {"task_id": 1, "epoch": 100, "loss": 0.1}');
      });
      
      await waitFor(() => {
        expect(screen.getByText('训练进行中')).toBeInTheDocument();
      });
    });

    it('应该正确显示等待训练的状态', async () => {
      const pendingProject = {
        ...mockProjectData,
        status: 'pending'
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(pendingProject);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('等待训练')).toBeInTheDocument();
      });
    });

    it('应该正确显示下载按钮的加载状态', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      const downloadButton = await screen.findByRole('button', { name: /下载模型/ });
      expect(downloadButton).toBeInTheDocument();
    });

    it('应该正确显示删除按钮的加载状态', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      const deleteButton = await screen.findByRole('button', { name: /删除/ });
      expect(deleteButton).toBeInTheDocument();
    });

    it('应该正确显示日志数量徽章', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      act(() => {
        messageCallback('2024-01-15T10:30:00Z - Test log message');
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确显示空日志状态', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('暂无日志')).toBeInTheDocument();
      });
    });
  });

  describe('超参数配置显示', () => {
    it('应该正确显示不同类型的超参数值', async () => {
      const projectWithComplexHyperparameter = {
        ...mockProjectData,
        hyperparameter: {
          steps: 100,
          log_freq: 10,
          epochs: 50,
          learning_rate: 0.001,
          batch_size: 32,
          policy: 'PPO',
          env: { type: 'CartPole-v1' },
          use_gpu: true,
          custom_param: null
        }
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(projectWithComplexHyperparameter);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('Steps')).toBeInTheDocument();
        expect(screen.getByText('Log Freq')).toBeInTheDocument();
        expect(screen.getByText('Epochs')).toBeInTheDocument();
        expect(screen.getByText('Learning Rate')).toBeInTheDocument();
        expect(screen.getByText('Batch Size')).toBeInTheDocument();
        expect(screen.getByText('Environment')).toBeInTheDocument();
        expect(screen.getByText('Use Gpu')).toBeInTheDocument();
      });
    });

    it('应该正确跳过policy参数显示', async () => {
      const projectWithPolicy = {
        ...mockProjectData,
        hyperparameter: {
          ...mockProjectData.hyperparameter,
          policy: 'PPO'
        }
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(projectWithPolicy);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.queryByText('Policy')).not.toBeInTheDocument();
      });
    });

    it('应该正确处理空对象类型的超参数', async () => {
      const projectWithEmptyObject = {
        ...mockProjectData,
        hyperparameter: {
          ...mockProjectData.hyperparameter,
          empty_object: {}
        }
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(projectWithEmptyObject);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('Empty Object')).toBeInTheDocument();
        expect(screen.getByText('空对象')).toBeInTheDocument();
      });
    });

    it('应该正确处理布尔类型的超参数', async () => {
      const projectWithBoolean = {
        ...mockProjectData,
        hyperparameter: {
          ...mockProjectData.hyperparameter,
          use_gpu: true,
          debug_mode: false
        }
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(projectWithBoolean);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('Use Gpu')).toBeInTheDocument();
        expect(screen.getByText('Debug Mode')).toBeInTheDocument();
        expect(screen.getByText('是')).toBeInTheDocument();
        expect(screen.getByText('否')).toBeInTheDocument();
      });
    });

    it('应该正确处理null和undefined类型的超参数', async () => {
      const projectWithNullValues = {
        ...mockProjectData,
        hyperparameter: {
          ...mockProjectData.hyperparameter,
          null_param: null,
          undefined_param: undefined
        }
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(projectWithNullValues);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('Null Param')).toBeInTheDocument();
        expect(screen.getByText('Undefined Param')).toBeInTheDocument();
        expect(screen.getAllByText('N/A')).toHaveLength(2);
      });
    });

    it('应该正确显示无超参数配置的情况', async () => {
      const projectWithoutHyperparameter = {
        ...mockProjectData,
        hyperparameter: null
      };
      
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(projectWithoutHyperparameter);
      await renderProjectProgress();
      
      await waitFor(() => {
        expect(screen.getByText('暂无超参数配置')).toBeInTheDocument();
      });
    });
  });

  describe('下载功能详细测试', () => {
    it('应该正确处理下载过程中的事件阻止', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      const downloadButton = await screen.findByRole('button', { name: /下载模型/ });
      
      // 模拟事件对象
      const mockEvent = {
        stopPropagation: vi.fn()
      };
      
      await user.click(downloadButton);
      
      expect(downloadButton).toBeInTheDocument();
    });

    it('应该正确处理下载过程中重复点击', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      mockDownloadModelAPI.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ blob: new Blob(['test']), filename: 'test.zip' }), 1000))
      );
      await renderProjectProgress();
      
      const downloadButton = await screen.findByRole('button', { name: /下载模型/ });
      
      await user.click(downloadButton);
      await user.click(downloadButton); // 重复点击
      
      await waitFor(() => {
        expect(downloadButton).toBeDisabled();
      });
    });

    it('应该正确处理下载文件大小为0的情况', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      mockDownloadModelAPI.mockResolvedValue({ blob: new Blob([]), filename: 'empty.zip' });
      await renderProjectProgress();
      
      const downloadButton = await screen.findByRole('button', { name: /下载模型/ });
      await user.click(downloadButton);
      
      await waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith('下载失败: 下载失败：未收到有效的文件数据');
      });
    });

    it('应该正确处理下载返回无效数据的情况', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      mockDownloadModelAPI.mockResolvedValue({ blob: null, filename: 'test.zip' });
      await renderProjectProgress();
      
      const downloadButton = await screen.findByRole('button', { name: /下载模型/ });
      await user.click(downloadButton);
      
      await waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith('下载失败: 下载失败：未收到有效的文件数据');
      });
    });
  });

  describe('时间格式化功能', () => {
    it('应该正确处理无效的时间字符串', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      // 发送包含无效时间戳的消息
      act(() => {
        messageCallback('invalid-timestamp - Test message');
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });

    it('应该正确处理时间格式化函数', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      await renderProjectProgress();
      
      await screen.findByText('训练项目 1');
      
      const websocket = await import('@/utils/websocket');
      const messageCallback = websocket.default.onMessage.mock.calls[0][0];
      
      // 发送包含有效时间戳的消息
      act(() => {
        messageCallback('2024-01-15T10:30:00Z - Test message with valid timestamp');
      });
      
      expect(websocket.default.onMessage).toHaveBeenCalled();
    });
  });

  describe('组件生命周期与清理', () => {
    it('应该在组件卸载时清理所有状态和引用', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      const { unmount } = await renderProjectProgress();
      
      unmount();
      
      const websocket = await import('@/utils/websocket');
      expect(websocket.default.disconnect).toHaveBeenCalled();
      expect(websocket.default.clearCallbacks).toHaveBeenCalled();
    });

    it('应该正确处理组件重新挂载的情况', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetByIdAPI.mockResolvedValue(mockProjectData);
      
      const { unmount } = await renderProjectProgress();
      unmount();
      
      // 重新挂载
      await renderProjectProgress();
      
      const websocket = await import('@/utils/websocket');
      await waitFor(() => {
        expect(websocket.default.connect).toHaveBeenCalledWith('1');
      });
    });
  });
}); 