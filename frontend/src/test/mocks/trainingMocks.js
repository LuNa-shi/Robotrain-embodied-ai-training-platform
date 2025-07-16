// 训练页面的模拟数据

export const mockDatasets = [
  {
    id: 1,
    dataset_name: '工业机器人视觉数据集',
    description: '包含多种工业场景的机器人视觉图像，用于目标检测、抓取定位和路径规划训练',
    owner_id: 1,
    dataset_uuid: 'ds-20250625-001',
    uploaded_at: '2025-06-25T10:30:15.000Z',
    size: '2.5GB',
    samples: 15000
  },
  {
    id: 2,
    dataset_name: '机械臂动作控制数据',
    description: '机械臂运动轨迹和关节角度数据，用于机器人动作控制和轨迹优化训练',
    owner_id: 1,
    dataset_uuid: 'ds-20250624-007',
    uploaded_at: '2025-06-24T18:45:00.000Z',
    size: '1.8GB',
    samples: 12000
  }
];

export const mockModelTypes = [
  {
    id: 1,
    type_name: 'GPT模型',
    description: '基于GPT架构的对话模型'
  },
  {
    id: 2,
    type_name: 'BERT模型',
    description: '基于BERT架构的文本理解模型'
  }
];

export const mockFormattedModels = [
  {
    value: '1',
    label: 'GPT模型',
    description: '基于GPT架构的对话模型'
  },
  {
    value: '2',
    label: 'BERT模型',
    description: '基于BERT架构的文本理解模型'
  }
];

export const mockDatasetsResponse = mockDatasets;

export const mockModelTypesResponse = mockModelTypes;

export const mockCreateTrainingResponse = {
  success: true,
  data: {
    id: 123,
    task_id: 'task-123',
    status: 'pending'
  },
  message: '训练任务创建成功'
};

export const mockTrainingFormData = {
  model: '1',
  env: 'aloha',
  log_freq: 25,
  steps: 100,
  batch_size: 8,
  description: '测试训练任务'
}; 