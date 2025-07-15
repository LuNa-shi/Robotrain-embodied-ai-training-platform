// 为了让模拟数据更贴近真实 API 返回的结构，我们进行如下修改
export const mockDatasets = [
    {
      id: 1, // id 用于 key 和操作，可以保留
      dataset_uuid: 'uuid-mock-001', // 添加 dataset_uuid
      dataset_name: '测试数据集1', // 将 name 修改为 dataset_name
      description: '这是一个测试数据集',
      uploaded_at: '2024-01-15T10:30:00Z', // 将 create_time 修改为 uploaded_at
      status: 'ready'
    },
    {
      id: 2,
      dataset_uuid: 'uuid-mock-002',
      dataset_name: '测试数据集2', // 将 name 修改为 dataset_name
      description: '另一个测试数据集',
      uploaded_at: '2024-01-16T14:20:00Z', // 将 create_time 修改为 uploaded_at
      status: 'ready'
    }
  ];
  
  // mockDatasetsResponse 直接引用修改后的 mockDatasets
  export const mockDatasetsResponse = mockDatasets;
  
  export const mockEmptyDatasetsResponse = [];
  
  export const mockDeleteResponse = {
    success: true,
    message: '数据集删除成功'
  };