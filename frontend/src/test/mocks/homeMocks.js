// Home页面测试的mock数据

// 模拟上传成功响应
export const mockUploadResponse = {
  id: 1,
  name: '测试数据集',
  description: '这是一个测试数据集',
  file_name: 'test_dataset.zip',
  file_size: 1024000,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  status: 'uploaded'
};

// 模拟文件对象
export const createMockFile = (name = 'test.zip', size = 1024) => {
  const file = new File(['test content'], name, { type: 'application/zip' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

// 模拟非ZIP文件
export const createMockNonZipFile = (name = 'test.txt', size = 1024) => {
  const file = new File(['test content'], name, { type: 'text/plain' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

// 模拟超过500MB的文件
export const createMockLargeFile = (name = 'large.zip', size = 501 * 1024 * 1024) => {
  const file = new File(['test content'], name, { type: 'application/zip' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

// 模拟刚好500MB的文件
export const createMockMaxSizeFile = (name = 'max-size.zip', size = 500 * 1024 * 1024) => {
  const file = new File(['test content'], name, { type: 'application/zip' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}; 