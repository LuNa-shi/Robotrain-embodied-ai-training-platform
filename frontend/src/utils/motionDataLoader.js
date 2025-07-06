// 直接加载 JSON 运动数据
export const loadMotionDataFromJson = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('无法加载运动数据JSON');
    const data = await response.json();
    console.log('加载运动数据:', data.length, '个数据点');
    return data;
  } catch (e) {
    console.error('加载运动数据失败:', e);
    return [];
  }
};