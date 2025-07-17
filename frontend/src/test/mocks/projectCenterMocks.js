// 项目中心页面的模拟数据

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

export const mockDatasets = [
  {
    id: 1,
    dataset_name: '机器人视觉数据集',
    description: '用于机器人视觉识别的数据集',
    owner_id: 1,
    dataset_uuid: 'uuid-001',
    uploaded_at: '2024-01-15T10:00:00Z',
    total_episodes: 100,
    total_chunks: 10,
    video_keys: ['front_view', 'side_view'],
    chunks_size: 1024,
    video_path: '/videos/dataset1',
    data_path: '/data/dataset1'
  },
  {
    id: 2,
    dataset_name: '机械臂控制数据集',
    description: '用于机械臂动作控制的数据集',
    owner_id: 1,
    dataset_uuid: 'uuid-002',
    uploaded_at: '2024-01-16T14:00:00Z',
    total_episodes: 150,
    total_chunks: 15,
    video_keys: ['top_view', 'side_view'],
    chunks_size: 2048,
    video_path: '/videos/dataset2',
    data_path: '/data/dataset2'
  },
  {
    id: 3,
    dataset_name: '无人机航拍数据集',
    description: '用于无人机航拍任务的数据集',
    owner_id: 1,
    dataset_uuid: 'uuid-003',
    uploaded_at: '2024-01-17T09:00:00Z',
    total_episodes: 80,
    total_chunks: 8,
    video_keys: ['aerial_view'],
    chunks_size: 1536,
    video_path: '/videos/dataset3',
    data_path: '/data/dataset3'
  }
];

export const mockTrainingTasks = [
  {
    id: 1,
    model_type_id: 1,
    dataset_id: 1,
    status: 'completed',
    create_time: '2024-01-15T10:30:00Z',
    start_time: '2024-01-15T10:30:00Z',
    end_time: '2024-01-15T11:30:00Z',
    model_uuid: 'model-123'
  },
  {
    id: 2,
    model_type_id: 2,
    dataset_id: 2,
    status: 'running',
    create_time: '2024-01-16T14:20:00Z',
    start_time: '2024-01-16T14:20:00Z',
    end_time: null,
    model_uuid: 'model-456'
  },
  {
    id: 3,
    model_type_id: 1,
    dataset_id: 3,
    status: 'failed',
    create_time: '2024-01-17T09:15:00Z',
    start_time: '2024-01-17T09:15:00Z',
    end_time: '2024-01-17T09:45:00Z',
    model_uuid: null
  }
];

export const mockModelTypesResponse = mockModelTypes;

export const mockDatasetsResponse = mockDatasets;

export const mockTrainingTasksResponse = mockTrainingTasks;

export const mockEmptyTrainingTasksResponse = [];

export const mockDeleteTaskResponse = {
  success: true,
  message: '训练任务删除成功'
};

export const mockDownloadBlob = new Blob(['mock model data'], { type: 'application/zip' }); 