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

export const mockTrainingTasksResponse = mockTrainingTasks;

export const mockEmptyTrainingTasksResponse = [];

export const mockDeleteTaskResponse = {
  success: true,
  message: '训练任务删除成功'
};

export const mockDownloadBlob = new Blob(['mock model data'], { type: 'application/zip' }); 