import init, { readParquet } from 'parquet-wasm';
import { tableFromIPC } from 'apache-arrow';
import wasmUrl from 'parquet-wasm/esm/parquet_wasm_bg.wasm?url';

let initPromise = null;

const initializeWasm = () => {
  if (initPromise) {
    return initPromise;
  }
  initPromise = new Promise(async (resolve, reject) => {
    try {
      await init(wasmUrl);
      console.log('parquet-wasm 初始化成功。');
      resolve();
    } catch (error) {
      console.error('初始化 parquet-wasm 时失败:', error);
      initPromise = null;
      reject(error);
    }
  });
  return initPromise;
};

/**
 * [MODIFIED] 将原始数据行转换为包含所有必要信息的JS对象。
 * 现在会保留 episode_index。
 */
const convertRLDataToJointData = (rawData) => {
  if (!rawData || rawData.length === 0) return [];
  const firstRow = rawData[0];
  if (firstRow.action && typeof firstRow.action.toArray === 'function') {
    return rawData.map(row => {
      const actionVector = row.action.toArray();
      return {
        time: row.timestamp,
        // BigInt to Number conversion for easier use
        episode_index: Number(row.episode_index), 
        'vx300s_left/waist':        actionVector[0],
        'vx300s_left/shoulder':     actionVector[1],
        'vx300s_left/elbow':        actionVector[2],
        'vx300s_left/forearm_roll': actionVector[3],
        'vx300s_left/wrist_angle':  actionVector[4],
        'vx300s_left/wrist_rotate': actionVector[5],
        'vx300s_left/gripper':      actionVector[6],
        'vx300s_right/waist':       actionVector[7],
        'vx300s_right/shoulder':    actionVector[8],
        'vx300s_right/elbow':       actionVector[9],
        'vx300s_right/forearm_roll':actionVector[10],
        'vx300s_right/wrist_angle': actionVector[11],
        'vx300s_right/wrist_rotate':actionVector[12],
        'vx300s_right/gripper':     actionVector[13],
      };
    });
  }
  return [];
};

/**
 * [NEW] 按 episode_index 对数据进行分组。
 * @param {Array<Object>} processedData - 已处理的数据数组。
 * @returns {Object} - 一个以 episode_index 为键，数据数组为值的对象。
 */
const groupDataByEpisode = (processedData) => {
    const episodeMap = {};
    for (const row of processedData) {
        const { episode_index } = row;
        if (!episodeMap[episode_index]) {
            episodeMap[episode_index] = [];
        }
        episodeMap[episode_index].push(row);
    }
    console.log(`数据已根据 episode_index 被分割为 ${Object.keys(episodeMap).length} 个组。`);
    return episodeMap;
}

/**
 * [MODIFIED] 主加载函数，现在返回按episode分组的数据。
 */
export const loadMotionDataFromParquet = async (url) => {
  try {
    await initializeWasm();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP 请求失败! 状态码: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const ipcStream = readParquet(new Uint8Array(arrayBuffer)).intoIPCStream();
    const table = tableFromIPC(ipcStream);
    const rawData = table.toArray().map(rowProxy => rowProxy.toJSON());
    
    // 1. 转换数据
    const processedData = convertRLDataToJointData(rawData);
    
    // 2. 按Episode分组
    const groupedData = groupDataByEpisode(processedData);

    return groupedData;
  } catch (error) {
    console.error('加载或解析 Parquet 数据失败:', error);
    return {}; // 返回空对象以防出错
  }
};
