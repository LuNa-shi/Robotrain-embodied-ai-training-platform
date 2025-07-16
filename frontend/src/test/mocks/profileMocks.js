// Profile页面测试用的mock数据

export const mockUserInfo = {
  username: 'testuser',
  email: 'test@example.com',
  phone: '13800138000',
  avatar: null,
  bio: '测试用户简介',
  location: '北京',
  joinDate: '2024-01-15',
  role: '普通用户',
  isAdmin: false,
  created_at: '2024-01-15T00:00:00.000Z',
};

export const mockAdminUserInfo = {
  username: 'admin',
  email: 'admin@robotrain.com',
  phone: '13800138000',
  avatar: null,
  bio: '机器人训练平台管理员，专注于AI和机器学习技术。',
  location: '北京',
  joinDate: '2024-01-15',
  role: '管理员',
  isAdmin: true,
  created_at: '2024-01-15T00:00:00.000Z',
};

export const mockUpdatedUserData = {
  username: 'updateduser',
  email: 'updated@example.com',
  phone: '13900139000',
  avatar: null,
  bio: '更新后的个人简介',
  location: '上海',
  joinDate: '2024-01-15',
  role: '普通用户',
};

export const mockFormValues = {
  username: 'formuser',
  email: 'form@example.com',
  phone: '13700137000',
  location: '广州',
  bio: '表单测试简介',
};

export const mockValidationErrors = {
  username: '请输入您的用户名!',
  email: '请输入有效的邮箱地址!',
};

export const mockFile = {
  name: 'avatar.jpg',
  type: 'image/jpeg',
  size: 1024 * 1024, // 1MB
  lastModified: Date.now(),
};

export const mockLargeFile = {
  name: 'large-avatar.jpg',
  type: 'image/jpeg',
  size: 5 * 1024 * 1024, // 5MB
  lastModified: Date.now(),
};

export const mockInvalidFile = {
  name: 'document.pdf',
  type: 'application/pdf',
  size: 1024 * 1024, // 1MB
  lastModified: Date.now(),
}; 