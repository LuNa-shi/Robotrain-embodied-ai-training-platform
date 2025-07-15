import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import DataCenterPage from '@/pages/DataCenter';
import { mockDatasets, mockDatasetsResponse, mockEmptyDatasetsResponse, mockDeleteResponse } from '../mocks/dataCenterMocks';

// --- Mocks ---
vi.mock('@/utils/api', () => ({
  datasetsAPI: {
    getMyDatasets: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@ant-design/icons', () => ({
  InfoCircleOutlined: () => <span>InfoIcon</span>,
  PlayCircleOutlined: () => <span>PlayIcon</span>,
  DownloadOutlined: () => <span>DownloadIcon</span>,
  DeleteOutlined: () => <span>DeleteIcon</span>,
  MoreOutlined: () => <span>MoreIcon</span>,
  UploadOutlined: () => <span>UploadIcon</span>,
  BarChartOutlined: () => <span>ChartIcon</span>,
  SyncOutlined: () => <span>SyncIcon</span>,
}));

// 核心修改：从 Home.test.jsx 复制过来的、证明可行的 antd mock 方案
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
    modal: mockModal, // 返回我们定义的 mockModal
  });
  return {
    ...actual,
    App: MockApp,
  };
});


// --- 测试套件 ---
describe('DataCenter Page', () => {
  let user;
  let mockGetDatasetsAPI;
  let mockDeleteAPI;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query) => ({ matches: false, media: query, addListener: vi.fn(), removeListener: vi.fn() }),
    });
    vi.useFakeTimers();
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    // 清理我们定义的 mock 对象
    mockNavigate.mockClear();
    mockMessage.success.mockClear();
    mockMessage.info.mockClear();
    mockMessage.error.mockClear();
    mockModal.confirm.mockClear();

    const api = await import('@/utils/api');
    mockGetDatasetsAPI = api.datasetsAPI.getMyDatasets;
    mockDeleteAPI = api.datasetsAPI.delete;
    mockGetDatasetsAPI.mockClear();
    mockDeleteAPI.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderDataCenter = async () => {
    const antd = await import('antd');
    return render(
      <BrowserRouter>
        <antd.App>
          <DataCenterPage />
        </antd.App>
      </BrowserRouter>
    );
  };

  describe('页面渲染', () => {
    it('应该正确渲染数据中心页面的标题和描述', async () => {
        mockGetDatasetsAPI.mockResolvedValue(mockDatasetsResponse);
        await renderDataCenter();
        expect(await screen.findByRole('heading', { name: '数据中心' })).toBeInTheDocument();
        expect(screen.getByText('管理您上传的机器人训练数据集和文件')).toBeInTheDocument();
      });

    it('应该在加载时显示加载状态', async () => {
      mockGetDatasetsAPI.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mockDatasetsResponse), 100)));
      await renderDataCenter();
      expect(screen.getByText('加载中...')).toBeInTheDocument();
    });

    it('应该正确显示数据集列表', async () => {
      mockGetDatasetsAPI.mockResolvedValue(mockDatasetsResponse);
      await renderDataCenter();
      await waitFor(() => {
        expect(screen.getByText('测试数据集1')).toBeInTheDocument();
        expect(screen.getByText('测试数据集2')).toBeInTheDocument();
      });
    });

    it('应该在数据集为空时显示空状态', async () => {
      mockGetDatasetsAPI.mockResolvedValue(mockEmptyDatasetsResponse);
      await renderDataCenter();
      await waitFor(() => {
        expect(screen.getByText('数据列表为空')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /去上传数据/ })).toBeInTheDocument();
      });
    });
  });

  describe('导航功能', () => {
    it('点击"去上传数据"按钮应该跳转到首页', async () => {
      mockGetDatasetsAPI.mockResolvedValue(mockEmptyDatasetsResponse);
      await renderDataCenter();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /去上传数据/ })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /去上传数据/ }));
      expect(mockNavigate).toHaveBeenCalledWith('/home');
    });

    it('点击数据集卡片应该跳转到数据集可视化页面', async () => {
        mockGetDatasetsAPI.mockResolvedValue(mockDatasetsResponse);
        await renderDataCenter();
        await waitFor(() => {
          expect(screen.getByText('测试数据集1')).toBeInTheDocument();
        });
        const datasetCard = screen.getByText('测试数据集1').closest('.ant-card');
        await user.click(datasetCard);
        expect(mockNavigate).toHaveBeenCalledWith('/dataset-visualization/1');
      });
  });

  // ########## 新增的测试套件 ##########
  describe('主操作按钮', () => {
    beforeEach(async () => {
        // 为这个套件内的所有测试准备好带有数据的页面
        mockGetDatasetsAPI.mockResolvedValue(mockDatasetsResponse);
        await renderDataCenter();
        // 等待第一个卡片出现，确保页面已加载
        await screen.findByText('测试数据集1');
    });

    it('点击"查看详情"图标按钮应该跳转到详情页面', async () => {
        // Antd的Tooltip会给内部的按钮一个aria-label，使其无障碍名称为Tooltip的title
        // 使用findAllByRole是因为每个卡片都有一个这样的按钮
        const detailsButtons = await screen.findAllByRole('button', { name: /查看详情/i });
        
        // 我们点击第一个卡片的按钮
        await user.click(detailsButtons[0]);

        // 验证导航行为
        expect(mockNavigate).toHaveBeenCalledWith('/dataset/1');
    });

    it('点击"发起训练"图标按钮应该跳转到训练页面', async () => {
        const trainButtons = await screen.findAllByRole('button', { name: /发起训练/i });
        
        // 点击第一个卡片的按钮
        await user.click(trainButtons[0]);

        // 验证导航行为
        expect(mockNavigate).toHaveBeenCalledWith('/training?datasetId=1');
    });
  });
  // ####################################

  describe('数据集操作 (更多菜单)', () => {
    beforeEach(async () => {
      mockGetDatasetsAPI.mockResolvedValue(mockDatasetsResponse);
      await renderDataCenter();
      await waitFor(() => {
        expect(screen.getByText('测试数据集1')).toBeInTheDocument();
      });
    });

    it('点击更多操作按钮应该显示操作菜单', async () => {
        const moreButtons = screen.getAllByRole('button', { name: /更多/i });
        await user.click(moreButtons[0]);
        expect(await screen.findByRole('menuitem', { name: /查看详情/ })).toBeInTheDocument();
        expect(await screen.findByRole('menuitem', { name: /查看可视化/ })).toBeInTheDocument();
        expect(await screen.findByRole('menuitem', { name: /下载/ })).toBeInTheDocument();
        expect(await screen.findByRole('menuitem', { name: /删除/ })).toBeInTheDocument();
    });

    it('点击菜单中的"查看详情"应该跳转到数据集详情页面', async () => {
        const moreButtons = screen.getAllByRole('button', { name: /更多/i });
        await user.click(moreButtons[0]);
        const detailsButton = await screen.findByRole('menuitem', { name: /查看详情/ });
        await user.click(detailsButton);
        expect(mockNavigate).toHaveBeenCalledWith('/dataset/1');
    });

    it('点击菜单中的"查看可视化"应该跳转到数据集可视化页面', async () => {
        const moreButtons = screen.getAllByRole('button', { name: /更多/i });
        await user.click(moreButtons[0]);
        const vizButton = await screen.findByRole('menuitem', { name: /查看可视化/ });
        await user.click(vizButton);
        expect(mockNavigate).toHaveBeenCalledWith('/dataset-visualization/1');
    });

    it('点击下载应该显示提示信息', async () => {
        const moreButtons = screen.getAllByRole('button', { name: /更多/i });
        await user.click(moreButtons[0]);
        const downloadButton = await screen.findByRole('menuitem', { name: /下载/ });
        await user.click(downloadButton);
        expect(mockMessage.info).toHaveBeenCalledWith('下载功能待实现');
    });

    it('点击删除应该显示确认对话框', async () => {
        const moreButtons = screen.getAllByRole('button', { name: /更多/i });
        await user.click(moreButtons[0]);
        const deleteButton = await screen.findByRole('menuitem', { name: /删除/ });
        await user.click(deleteButton);
        expect(mockModal.confirm).toHaveBeenCalledWith(
            expect.objectContaining({ title: '确认删除' })
        );
    });

    it('确认删除应该调用删除API并刷新列表', async () => {
        mockDeleteAPI.mockResolvedValue(mockDeleteResponse);
        mockModal.confirm.mockImplementation(config => {
          if (config.onOk) config.onOk();
        });
        const moreButtons = screen.getAllByRole('button', { name: /更多/i });
        await user.click(moreButtons[0]);
        await user.click(await screen.findByRole('menuitem', { name: /删除/ }));
        expect(mockDeleteAPI).toHaveBeenCalledWith(1);
        await waitFor(() => {
          expect(mockMessage.success).toHaveBeenCalledWith('数据集删除成功');
        });
        expect(mockGetDatasetsAPI).toHaveBeenCalledTimes(2);
    });
  });

  describe('错误处理', () => {
    it('应该在API调用失败时显示错误信息', async () => {
      const errorMessage = '网络错误';
      mockGetDatasetsAPI.mockRejectedValue(new Error(errorMessage));
      await renderDataCenter();
      await waitFor(() => {
        expect(screen.getByText(`加载失败: ${errorMessage}`)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
      });
    });

    it('点击重试按钮应该重新获取数据', async () => {
      mockGetDatasetsAPI.mockRejectedValueOnce(new Error('网络错误'));
      mockGetDatasetsAPI.mockResolvedValueOnce(mockDatasetsResponse);
      await renderDataCenter();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /重试/ }));
      await waitFor(() => {
        expect(screen.getByText('测试数据集1')).toBeInTheDocument();
      });
    });
  });
});