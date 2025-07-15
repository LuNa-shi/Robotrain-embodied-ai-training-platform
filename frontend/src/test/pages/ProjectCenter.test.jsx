import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
// 直接从 antd 导入 message，以便我们可以 spyOn 它
import { message } from 'antd';
import ProjectCenterPage from '@/pages/ProjectCenter';
import {
  mockModelTypesResponse,
  mockTrainingTasksResponse,
  mockEmptyTrainingTasksResponse,
  mockDeleteTaskResponse,
  mockDownloadBlob
} from '../mocks/projectCenterMocks';

// --- Mocks ---
vi.mock('@/utils/api', () => ({
  trainTasksAPI: {
    getMyTasks: vi.fn(),
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
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@ant-design/icons', () => ({
  InfoCircleOutlined: () => <span>InfoIcon</span>,
  SyncOutlined: () => <span>SyncIcon</span>,
  DownloadOutlined: () => <span>DownloadIcon</span>,
  DeleteOutlined: () => <span>DeleteIcon</span>,
  CheckCircleOutlined: () => <span>CheckIcon</span>,
  CloseCircleOutlined: () => <span>CloseIcon</span>,
  ClockCircleOutlined: () => <span>ClockIcon</span>,
  PlusOutlined: () => <span>PlusIcon</span>,
}));

const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();
Object.defineProperty(window, 'URL', {
  value: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
});

// --- 测试套件 ---
describe('ProjectCenter Page', () => {
  let user;
  let mockGetTasksAPI;
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

    // 在这里直接 spyOn antd 的 message 对象
    vi.spyOn(message, 'success').mockImplementation(vi.fn());
    vi.spyOn(message, 'error').mockImplementation(vi.fn());
    vi.spyOn(message, 'info').mockImplementation(vi.fn());

    mockNavigate.mockClear();
    mockCreateObjectURL.mockClear();
    mockRevokeObjectURL.mockClear();

    const api = await import('@/utils/api');
    mockGetTasksAPI = api.trainTasksAPI.getMyTasks;
    mockGetModelTypesAPI = api.modelsAPI.getAllModelTypes;
    mockDownloadModelAPI = api.trainTasksAPI.downloadModel;
    mockDeleteTaskAPI = api.deleteTrainTask;
    
    mockGetTasksAPI.mockClear();
    mockGetModelTypesAPI.mockClear();
    mockDownloadModelAPI.mockClear();
    mockDeleteTaskAPI.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const renderProjectCenter = async () => {
    return render(
      <BrowserRouter>
          <ProjectCenterPage />
      </BrowserRouter>
    );
  };

  describe('页面渲染', () => {
    it('应该正确渲染项目中心页面的标题和描述', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetTasksAPI.mockResolvedValue(mockTrainingTasksResponse);
      await renderProjectCenter();
      expect(await screen.findByRole('heading', { name: '项目中心' })).toBeInTheDocument();
      expect(screen.getByText('查看和管理您的机器人模型训练历史')).toBeInTheDocument();
    });

    it('应该在加载时显示加载状态', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetTasksAPI.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mockTrainingTasksResponse), 100)));
      await renderProjectCenter();
      expect(await screen.findByText('加载中...')).toBeInTheDocument();
    });

    it('应该正确显示训练项目列表', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetTasksAPI.mockResolvedValue(mockTrainingTasksResponse);
      await renderProjectCenter();
      expect(await screen.findByText('训练项目 1')).toBeInTheDocument();
    });

    it('应该在训练项目为空时显示空状态', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetTasksAPI.mockResolvedValue(mockEmptyTrainingTasksResponse);
      await renderProjectCenter();
      expect(await screen.findByText('暂无训练项目')).toBeInTheDocument();
    });
  });

  describe('导航功能', () => {
    it('点击"发起训练"按钮应该跳转到训练页面', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetTasksAPI.mockResolvedValue(mockEmptyTrainingTasksResponse);
      await renderProjectCenter();
      const trainButton = await screen.findByRole('button', { name: /发起训练/ });
      await user.click(trainButton);
      expect(mockNavigate).toHaveBeenCalledWith('/training');
    });

    it('点击训练项目卡片应该跳转到项目进度页面', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetTasksAPI.mockResolvedValue(mockTrainingTasksResponse);
      await renderProjectCenter();
      const projectCard = await screen.findByText('训练项目 1');
      await user.click(projectCard.closest('.ant-card'));
      expect(mockNavigate).toHaveBeenCalledWith('/project-center/1/progress');
    });
  });

  describe('项目操作', () => {
    beforeEach(async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetTasksAPI.mockResolvedValue(mockTrainingTasksResponse);
      await renderProjectCenter();
      await screen.findByText('训练项目 1');
    });

    it('点击下载按钮应该显示加载状态，然后成功下载', async () => {
      mockDownloadModelAPI.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockDownloadBlob), 500))
      );
      mockCreateObjectURL.mockReturnValue('blob:mock-file-url-12345');
      const card1 = await screen.findByText('训练项目 1').then(e => e.closest('.ant-card'));
      const downloadButton = await within(card1).findByRole('button', { name: "下载模型" });

      await user.click(downloadButton);

      await waitFor(() => {
        expect(downloadButton).toBeDisabled();
      });

      await vi.advanceTimersByTimeAsync(500);

      await waitFor(() => {
        expect(message.success).toHaveBeenCalledWith('模型文件下载成功');
      });
      
      expect(downloadButton).toBeEnabled();
      expect(mockDownloadModelAPI).toHaveBeenCalledWith('1');
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-file-url-12345');
    });

    it('点击删除按钮应该删除训练任务并刷新列表', async () => {
      mockDeleteTaskAPI.mockResolvedValue(mockDeleteTaskResponse);
      const remainingTasks = mockTrainingTasksResponse.filter(task => task.id !== 1);
      mockGetTasksAPI.mockResolvedValueOnce(remainingTasks);
      const card1 = await screen.findByText('训练项目 1').then(e => e.closest('.ant-card'));
      const deleteButton = await within(card1).findByRole('button', { name: "删除项目" });

      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.queryByText('训练项目 1')).not.toBeInTheDocument();
      });

      expect(mockDeleteTaskAPI).toHaveBeenCalledWith('1');
      expect(message.success).toHaveBeenCalledWith('删除成功');
      expect(mockGetTasksAPI).toHaveBeenCalledTimes(2); 
      expect(screen.getByText('训练项目 2')).toBeInTheDocument();
    });
  });

  describe('错误处理', () => {
    it('应该在获取训练任务失败时显示错误信息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetTasksAPI.mockRejectedValue(new Error('获取失败'));
      await renderProjectCenter();
      await waitFor(() => {
        // 关键修复：使用 message 而不是 mockMessage
        expect(message.error).toHaveBeenCalledWith('获取训练项目列表失败: 获取失败');
      });
    });

    it('应该在下载失败时显示错误信息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetTasksAPI.mockResolvedValue(mockTrainingTasksResponse);
      mockDownloadModelAPI.mockRejectedValue(new Error('下载失败'));
      await renderProjectCenter();
      const downloadButtons = await screen.findAllByRole('button', { name: "下载模型" });
      await user.click(downloadButtons[0]);
      await waitFor(() => {
        // 关键修复：使用 message 而不是 mockMessage
        expect(message.error).toHaveBeenCalledWith('下载失败: 下载失败');
      });
    });

    it('应该在删除失败时显示错误信息', async () => {
      mockGetModelTypesAPI.mockResolvedValue(mockModelTypesResponse);
      mockGetTasksAPI.mockResolvedValue(mockTrainingTasksResponse);
      mockDeleteTaskAPI.mockRejectedValue(new Error('删除失败'));
      await renderProjectCenter();
      const deleteButtons = await screen.findAllByRole('button', { name: "删除项目" });
      await user.click(deleteButtons[0]);
      await waitFor(() => {
        // 关键修复：使用 message 而不是 mockMessage
        expect(message.error).toHaveBeenCalledWith('删除失败');
      });
    });
  });
});