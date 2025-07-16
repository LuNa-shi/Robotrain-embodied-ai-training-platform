// 数据集详情页面的mock数据
export const mockDatasetDetail = {
  id: 1,
  dataset_uuid: 'uuid-mock-001',
  dataset_name: '测试数据集1',
  description: '这是一个用于测试的数据集，包含了丰富的机器人训练数据',
  uploaded_at: '2024-01-15T10:30:00Z',
  status: 'ready',
  owner_id: 1,
  file_size: 1024000,
  file_path: '/datasets/test-dataset-1.zip',
  created_at: '2024-01-15T10:30:00Z',
  updated_at: '2024-01-15T10:30:00Z'
};

export const mockDatasetDetailResponse = mockDatasetDetail;

export const mockEmptyDatasetResponse = null;

export const mockDeleteResponse = {
  success: true,
  message: '数据集删除成功'
};

export const mockErrorResponse = {
  message: '网络错误',
  status: 500
};

export const mockAuthErrorResponse = {
  message: '认证失败，请重新登录',
  status: 401
};

export const mockNotFoundErrorResponse = {
  message: '数据集不存在或已被删除',
  status: 404
}; 