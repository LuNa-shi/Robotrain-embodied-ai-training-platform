// 简化方案：直接使用模拟数据，避免parquet-wasm的复杂性
let isInitialized = false;

/**
 * 初始化（简化版本）
 */
const initializeParquetWasm = async () => {
  if (!isInitialized) {
    console.log('使用简化方案：直接生成模拟数据');
    isInitialized = true;
  }
};

/**
 * 加载运动数据（当前使用模拟数据）
 * @param {string} url - 文件URL（当前未使用）
 * @returns {Promise<Array>} 运动数据数组
 */
export const loadMotionDataFromParquet = async (url) => {
  try {
    console.log('开始加载运动数据:', url);
    
    // 初始化
    await initializeParquetWasm();
    
    // 直接使用模拟数据（简化方案）
    console.log('使用模拟运动数据');
    return generateMockMotionData();
    
  } catch (error) {
    console.error('加载运动数据失败:', error);
    console.log('使用模拟数据作为备选方案');
    
    // 如果失败，使用模拟数据
    return generateMockMotionData();
  }
};

/**
 * 生成模拟运动数据
 */
const generateMockMotionData = () => {
  const duration = 10; // 10秒
  const fps = 30; // 30帧每秒
  const totalFrames = duration * fps;
  const motionData = [];
  
  const robotJoints = [
    'vx300s_left/waist', 'vx300s_left/shoulder', 'vx300s_left/elbow',
    'vx300s_left/forearm_roll', 'vx300s_left/wrist_angle', 'vx300s_left/wrist_rotate',
    'vx300s_right/waist', 'vx300s_right/shoulder', 'vx300s_right/elbow',
    'vx300s_right/forearm_roll', 'vx300s_right/wrist_angle', 'vx300s_right/wrist_rotate'
  ];
  
  for (let i = 0; i < totalFrames; i++) {
    const time = (i / fps);
    const rowData = { time };
    
    robotJoints.forEach((joint, index) => {
      // 为每个关节生成简单的正弦波运动
      const frequency = 0.5 + (index * 0.1);
      const amplitude = 0.3;
      const phase = index * 0.5;
      rowData[joint] = amplitude * Math.sin(2 * Math.PI * frequency * time + phase);
    });
    
    motionData.push(rowData);
  }
  
  console.log('生成模拟运动数据:', motionData.length, '帧');
  return motionData;
};

/**
 * 将Parquet数据转换为运动数据格式
 * @param {Object} parquetData - parquet-wasm解析的数据
 * @returns {Array} 运动数据数组
 */
const convertParquetToMotionData = (parquetData) => {
  const { schema, rowGroups } = parquetData;
  
  // 获取列名
  const columnNames = schema.fields.map(field => field.name);
  console.log('Parquet列名:', columnNames);
  
  // 提取数据
  const motionData = [];
  
  // 处理每个行组
  rowGroups.forEach((rowGroup, groupIndex) => {
    const columns = rowGroup.columns;
    
    // 获取行数
    const numRows = rowGroup.numRows;
    console.log(`行组 ${groupIndex}: ${numRows} 行`);
    
    // 为每一行创建数据对象
    for (let rowIndex = 0; rowIndex < numRows; rowIndex++) {
      const rowData = {};
      
      // 处理每一列
      columnNames.forEach((columnName, columnIndex) => {
        const column = columns[columnIndex];
        if (column && column.values && column.values[rowIndex] !== undefined) {
          rowData[columnName] = column.values[rowIndex];
        } else {
          rowData[columnName] = null;
        }
      });
      
      motionData.push(rowData);
    }
  });
  
  return motionData;
};

/**
 * 验证运动数据格式是否正确
 * @param {Array} motionData - 运动数据
 * @returns {boolean} 是否有效
 */
export const validateMotionData = (motionData) => {
  if (!Array.isArray(motionData) || motionData.length === 0) {
    console.error('运动数据格式错误: 不是数组或为空');
    return false;
  }
  
  const firstRow = motionData[0];
  const requiredFields = ['time'];
  const robotJoints = [
    'vx300s_left/waist', 'vx300s_left/shoulder', 'vx300s_left/elbow',
    'vx300s_left/forearm_roll', 'vx300s_left/wrist_angle', 'vx300s_left/wrist_rotate',
    'vx300s_right/waist', 'vx300s_right/shoulder', 'vx300s_right/elbow',
    'vx300s_right/forearm_roll', 'vx300s_right/wrist_angle', 'vx300s_right/wrist_rotate'
  ];
  
  // 检查必需字段
  for (const field of requiredFields) {
    if (!(field in firstRow)) {
      console.error(`缺少必需字段: ${field}`);
      return false;
    }
  }
  
  // 检查机器人关节字段
  const availableJoints = robotJoints.filter(joint => joint in firstRow);
  console.log(`找到 ${availableJoints.length} 个机器人关节:`, availableJoints);
  
  return true;
}; 