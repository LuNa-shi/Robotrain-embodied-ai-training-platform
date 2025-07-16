// 数据集可视化页面的mock数据

// 数据集详情mock
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
  updated_at: '2024-01-15T10:30:00Z',
  total_episodes: 5,
  total_chunks: 3,
  video_keys: ['front_view', 'side_view', 'top_view'],
  chunks_size: 100,
  video_path: 'videos/{episode_chunk}/{video_key}/episode_{episode_index}.mp4',
  data_path: 'data/{episode_chunk}/episode_{episode_index}.parquet'
};

export const mockDatasetDetailResponse = mockDatasetDetail;

// 模拟视频blob数据
export const mockVideoBlob = new Blob(['mock video data'], { type: 'video/mp4' });

// 模拟parquet数据（ArrayBuffer格式）
export const mockParquetData = new ArrayBuffer(1024);

// 模拟运动数据
export const mockMotionData = [
  {
    time: 0,
    'vx300s_left/waist': 0.1,
    'vx300s_left/shoulder': 0.2,
    'vx300s_left/elbow': 0.3,
    'vx300s_left/forearm_roll': 0.4,
    'vx300s_left/wrist_angle': 0.5,
    'vx300s_left/wrist_rotate': 0.6,
    'vx300s_left/gripper': 0.7,
    'vx300s_right/waist': 0.8,
    'vx300s_right/shoulder': 0.9,
    'vx300s_right/elbow': 1.0,
    'vx300s_right/forearm_roll': 1.1,
    'vx300s_right/wrist_angle': 1.2,
    'vx300s_right/wrist_rotate': 1.3,
    'vx300s_right/gripper': 1.4,
  },
  {
    time: 0.1,
    'vx300s_left/waist': 0.15,
    'vx300s_left/shoulder': 0.25,
    'vx300s_left/elbow': 0.35,
    'vx300s_left/forearm_roll': 0.45,
    'vx300s_left/wrist_angle': 0.55,
    'vx300s_left/wrist_rotate': 0.65,
    'vx300s_left/gripper': 0.75,
    'vx300s_right/waist': 0.85,
    'vx300s_right/shoulder': 0.95,
    'vx300s_right/elbow': 1.05,
    'vx300s_right/forearm_roll': 1.15,
    'vx300s_right/wrist_angle': 1.25,
    'vx300s_right/wrist_rotate': 1.35,
    'vx300s_right/gripper': 1.45,
  },
  {
    time: 0.2,
    'vx300s_left/waist': 0.2,
    'vx300s_left/shoulder': 0.3,
    'vx300s_left/elbow': 0.4,
    'vx300s_left/forearm_roll': 0.5,
    'vx300s_left/wrist_angle': 0.6,
    'vx300s_left/wrist_rotate': 0.7,
    'vx300s_left/gripper': 0.8,
    'vx300s_right/waist': 0.9,
    'vx300s_right/shoulder': 1.0,
    'vx300s_right/elbow': 1.1,
    'vx300s_right/forearm_roll': 1.2,
    'vx300s_right/wrist_angle': 1.3,
    'vx300s_right/wrist_rotate': 1.4,
    'vx300s_right/gripper': 1.5,
  }
];

// 模拟按episode分组的数据
export const mockGroupedData = {
  0: mockMotionData,
  1: mockMotionData.map(d => ({ ...d, time: d.time + 0.3 })),
  2: mockMotionData.map(d => ({ ...d, time: d.time + 0.6 }))
};

// 错误响应mock
export const mockErrorResponse = {
  message: '网络错误',
  status: 500
};

export const mockCorsErrorResponse = {
  message: '跨域请求失败，请检查后端CORS配置',
  status: 403
};

export const mockServerErrorResponse = {
  message: '后端服务器错误，请检查后端日志',
  status: 500
};

export const mockNotFoundErrorResponse = {
  message: '数据集不存在或已被删除',
  status: 404
};

// 空数据集详情（无视频视角点）
export const mockEmptyDatasetDetail = {
  ...mockDatasetDetail,
  video_keys: []
};

// 无可用数据的响应
export const mockNoDataResponse = {
  ...mockDatasetDetail,
  total_episodes: 0,
  total_chunks: 0
}; 