import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { message } from 'antd';
import TrainingPage from '@/pages/Training';
import { mockDatasets, mockModelTypes } from '../mocks/trainingMocks';

// --- Mocks ---
vi.mock('@/utils/api', () => ({
  datasetsAPI: {
    getMyDatasets: vi.fn(),
  },
  modelsAPI: {
    getAllModelTypes: vi.fn(),
  },
  trainTasksAPI: {
    create: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
const mockLocation = {
  search: '',
  pathname: '/training',
  hash: '',
  state: null,
};

vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual();
  return { 
    ...actual, 
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  };
});

vi.mock('@/pages/Training/VerticalTimeline', () => ({
  default: () => <div data-testid="vertical-timeline">VerticalTimeline</div>,
}));

vi.mock('@ant-design/icons', () => ({
  PlayCircleOutlined: () => <span>PlayIcon</span>,
  RobotOutlined: () => <span>RobotIcon</span>,
  DatabaseOutlined: () => <span>DatabaseIcon</span>,
  SettingOutlined: () => <span>SettingIcon</span>,
  CheckCircleOutlined: () => <span>CheckIcon</span>,
  LoadingOutlined: () => <span>LoadingIcon</span>,
  InfoCircleOutlined: () => <span>InfoIcon</span>,
}));

const mockMessage = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
};

const mockModal = {
  confirm: vi.fn(),
};

// --- 测试套件 ---
describe('Training Page', () => {
  let user;
  let mockGetDatasetsAPI;
  let mockGetModelTypesAPI;
  let mockCreateTrainingAPI;

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
      value: () => ({ getPropertyValue: (prop) => '' })
    });

    vi.useFakeTimers();
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    vi.spyOn(message, 'success').mockImplementation(vi.fn());
    vi.spyOn(message, 'error').mockImplementation(vi.fn());
    vi.spyOn(message, 'info').mockImplementation(vi.fn());

    mockNavigate.mockClear();
    mockMessage.success.mockClear();
    mockMessage.error.mockClear();
    mockMessage.info.mockClear();
    mockModal.confirm.mockClear();

    const api = await import('@/utils/api');
    mockGetDatasetsAPI = api.datasetsAPI.getMyDatasets;
    mockGetModelTypesAPI = api.modelsAPI.getAllModelTypes;
    mockCreateTrainingAPI = api.trainTasksAPI.create;
    
    mockGetDatasetsAPI.mockClear();
    mockGetModelTypesAPI.mockClear();
    mockCreateTrainingAPI.mockClear();

    mockLocation.search = '';

    // 为所有测试预设API成功返回
    mockGetDatasetsAPI.mockResolvedValue(mockDatasets);
    mockGetModelTypesAPI.mockResolvedValue(mockModelTypes);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const renderTraining = async () => {
    const antd = await import('antd');
    return render(
      <BrowserRouter>
        <antd.App>
          <TrainingPage />
        </antd.App>
      </BrowserRouter>
    );
  };

  describe('用户交互流程测试', () => {

    it('步骤1: 应该首先渲染数据集列表', async () => {
      await renderTraining();
      await waitFor(() => {
        // 断言：验证第一步的标题和内容是否可见
        expect(screen.getByRole('heading', { name: '选择机器人训练数据集' })).toBeInTheDocument();
        expect(screen.getByText('工业机器人视觉数据集')).toBeInTheDocument();
      });
      // 断言：此时模型列表不应该在DOM中
      expect(screen.queryByText('GPT模型')).toBeNull();
    });

    it('步骤2: 点击数据集后，应该进入模型选择步骤并正确显示模型列表', async () => {
      await renderTraining();
      
      // 等待并执行第一步的操作
      const datasetCard = await screen.findByText('工业机器人视觉数据集');
      await user.click(datasetCard.closest('.ant-card'));

      // 等待UI更新到第二步
      await waitFor(() => {
        // 断言：验证第二步的标题和内容是否可见
        expect(screen.getByRole('heading', { name: '选择机器人训练模型' })).toBeInTheDocument();
        expect(screen.getByText('GPT模型')).toBeInTheDocument();
        expect(screen.getByText('BERT模型')).toBeInTheDocument();
      });
    });

    it('步骤3和4: 选择模型并配置参数后，应能成功提交并看到完成页面', async () => {
      const mockCreateResponse = { id: 123 };
      mockCreateTrainingAPI.mockResolvedValue(mockCreateResponse);
      
      await renderTraining();
      
      // 快速执行前两步
      await user.click((await screen.findByText('工业机器人视觉数据集')).closest('.ant-card'));
      await waitFor(async () => {
          await user.click((await screen.findByText('GPT模型')).closest('.ant-card'));
      });

      // 等待进入第三步
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '配置机器人训练参数' })).toBeInTheDocument();
      });

      // 执行第三步操作：点击提交
      await user.click(screen.getByRole('button', { name: /开始训练/ }));
      
      // 等待进入第四步
      await waitFor(() => {
        // 断言：验证成功消息和最终页面的标题
        expect(message.success).toHaveBeenCalledWith('机器人训练项目已成功创建！');
        expect(screen.getByRole('heading', { name: '机器人训练项目创建成功！' })).toBeInTheDocument();
      });

      // 验证API调用负载是否符合新的数据结构
      expect(mockCreateTrainingAPI).toHaveBeenCalledWith({
        dataset_id: 1,
        model_type_id: 1,
        hyperparameter: {
          policy: { type: 'gpt模型' },
          env: { type: 'aloha' },
          log_freq: 25,
          steps: 100,
          batch_size: 8,
        }
      });
    });
  });

  describe('其他交互与边界情况测试', () => {
    it('在完成页面，各个按钮应能正确导航', async () => {
      const mockCreateResponse = { id: 999 };
      mockCreateTrainingAPI.mockResolvedValue(mockCreateResponse);
      
      await renderTraining();
      
      // 快速完成流程
      await user.click((await screen.findByText('工业机器人视觉数据集')).closest('.ant-card'));
      await user.click((await screen.findByText('GPT模型')).closest('.ant-card'));
      await user.click(screen.getByRole('button', { name: /开始训练/ }));

      // 等待进入完成页面
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '机器人训练项目创建成功！' })).toBeInTheDocument();
      });

      // 测试“查看项目详情”按钮
      const detailsButton = screen.getByRole('button', { name: '查看项目详情' });
      await user.click(detailsButton);
      expect(mockNavigate).toHaveBeenCalledWith('/project-center/999/progress');

      // 测试“查看项目中心”按钮
      const projectCenterButton = screen.getByRole('button', { name: '查看项目中心' });
      await user.click(projectCenterButton);
      expect(mockNavigate).toHaveBeenCalledWith('/project-center');

      // 测试“创建新训练项目”按钮
      const createNewButton = screen.getByRole('button', { name: '创建新训练项目' });
      await user.click(createNewButton);
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '选择机器人训练数据集' })).toBeInTheDocument();
      });
    });

    it('如果URL中带有datasetId，应自动选中数据集并进入第二步', async () => {
      mockLocation.search = '?datasetId=2';
      await renderTraining();
      await waitFor(() => {
          expect(screen.getByRole('heading', { name: '选择机器人训练模型' })).toBeInTheDocument();
          expect(screen.getByText('已选择数据集: 机械臂动作控制数据')).toBeInTheDocument();
      });
    });

    it('应该验证batch_size不能超过16', async () => {
      await renderTraining();
      
      // 快速进入第三步
      await user.click((await screen.findByText('工业机器人视觉数据集')).closest('.ant-card'));
      await user.click((await screen.findByText('GPT模型')).closest('.ant-card'));
      
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '配置机器人训练参数' })).toBeInTheDocument();
      });

      // 找到batch_size输入框并输入超过16的值
      const batchSizeInput = screen.getByPlaceholderText('批次大小');
      await user.clear(batchSizeInput);
      await user.type(batchSizeInput, '20');

      // 验证错误消息是否显示
      await waitFor(() => {
        expect(screen.getByText('批次大小不能超过16')).toBeInTheDocument();
      });

      // 尝试提交表单，应该失败
      await user.click(screen.getByRole('button', { name: /开始训练/ }));
      
      // 验证没有调用API
      expect(mockCreateTrainingAPI).not.toHaveBeenCalled();
    });

    it('应该允许batch_size等于16', async () => {
      const mockCreateResponse = { id: 123 };
      mockCreateTrainingAPI.mockResolvedValue(mockCreateResponse);
      
      await renderTraining();
      
      // 快速进入第三步
      await user.click((await screen.findByText('工业机器人视觉数据集')).closest('.ant-card'));
      await user.click((await screen.findByText('GPT模型')).closest('.ant-card'));
      
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '配置机器人训练参数' })).toBeInTheDocument();
      });

      // 找到batch_size输入框并输入16
      const batchSizeInput = screen.getByPlaceholderText('批次大小');
      await user.clear(batchSizeInput);
      await user.type(batchSizeInput, '16');

      // 验证没有错误消息
      await waitFor(() => {
        expect(screen.queryByText('批次大小不能超过16')).not.toBeInTheDocument();
      });

      // 提交表单，应该成功
      await user.click(screen.getByRole('button', { name: /开始训练/ }));
      
      // 验证API被调用且batch_size为16
      await waitFor(() => {
        expect(mockCreateTrainingAPI).toHaveBeenCalledWith({
          dataset_id: 1,
          model_type_id: 1,
          hyperparameter: {
            policy: { type: 'gpt模型' },
            env: { type: 'aloha' },
            log_freq: 25,
            steps: 100,
            batch_size: 16,
          }
        });
      });
    });

    it('返回上一步后重新进入应该清除batch_size错误状态', async () => {
      await renderTraining();
      
      // 快速进入第三步
      await user.click((await screen.findByText('工业机器人视觉数据集')).closest('.ant-card'));
      await user.click((await screen.findByText('GPT模型')).closest('.ant-card'));
      
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '配置机器人训练参数' })).toBeInTheDocument();
      });

      // 输入超过16的值，产生错误
      const batchSizeInput = screen.getByPlaceholderText('批次大小');
      await user.clear(batchSizeInput);
      await user.type(batchSizeInput, '20');

      // 验证错误消息显示
      await waitFor(() => {
        expect(screen.getByText('批次大小不能超过16')).toBeInTheDocument();
      });

      // 点击返回上一步
      await user.click(screen.getByRole('button', { name: /返回上一步/ }));
      
      // 等待回到第二步
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '选择机器人训练模型' })).toBeInTheDocument();
      });

      // 重新选择模型进入第三步
      await user.click((await screen.findByText('GPT模型')).closest('.ant-card'));
      
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '配置机器人训练参数' })).toBeInTheDocument();
      });

      // 验证错误消息已经清除
      await waitFor(() => {
        expect(screen.queryByText('批次大小不能超过16')).not.toBeInTheDocument();
      });
    });

    it('输入超过16后修改为有效值应该清除错误状态', async () => {
      await renderTraining();
      
      // 快速进入第三步
      await user.click((await screen.findByText('工业机器人视觉数据集')).closest('.ant-card'));
      await user.click((await screen.findByText('GPT模型')).closest('.ant-card'));
      
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '配置机器人训练参数' })).toBeInTheDocument();
      });

      // 输入超过16的值，产生错误
      const batchSizeInput = screen.getByPlaceholderText('批次大小');
      await user.clear(batchSizeInput);
      await user.type(batchSizeInput, '20');

      // 验证错误消息显示
      await waitFor(() => {
        expect(screen.getByText('批次大小不能超过16')).toBeInTheDocument();
      });

      // 修改为有效值
      await user.clear(batchSizeInput);
      await user.type(batchSizeInput, '8');

      // 验证错误消息已经清除
      await waitFor(() => {
        expect(screen.queryByText('批次大小不能超过16')).not.toBeInTheDocument();
      });

      // 验证可以正常提交
      await user.click(screen.getByRole('button', { name: /开始训练/ }));
      
      // 验证API被调用
      await waitFor(() => {
        expect(mockCreateTrainingAPI).toHaveBeenCalledWith({
          dataset_id: 1,
          model_type_id: 1,
          hyperparameter: {
            policy: { type: 'gpt模型' },
            env: { type: 'aloha' },
            log_freq: 25,
            steps: 100,
            batch_size: 8,
          }
        });
      });
    });
  });
});