// 文件路径: tests/mocks/evaluationMocks.js

export const mockRunningEvalTask = {
    id: 2,
    status: 'running',
    video_names: [],
    eval_stage: 1,
    train_task_id: 102,
    create_time: '2024-05-21T11:00:00Z',
    start_time: '2024-05-21T11:05:00Z',
    end_time: null,
  };
  
  export const mockCompletedEvalTaskWithVideos = {
    id: 1,
    status: 'completed',
    video_names: ['video1.mp4', 'video2.mp4'],
    eval_stage: 4,
    train_task_id: 101,
    create_time: '2024-05-20T10:00:00Z',
    start_time: '2024-05-20T10:05:00Z',
    end_time: '2024-05-20T11:05:00Z',
  };
  
  export const mockCompletedEvalTaskWithoutVideos = {
    id: 1,
    status: 'completed',
    video_names: [],
    eval_stage: 4,
    train_task_id: 101,
    create_time: '2024-05-20T10:00:00Z',
    start_time: '2024-05-20T10:05:00Z',
    end_time: '2024-05-20T11:05:00Z',
  };
  
  export const mockInitialEvalTasks = [
    { id: 1, status: 'completed', video_names: ['video1.mp4', 'video2.mp4'], eval_stage: 4, train_task_id: 101, create_time: '2024-05-20T10:00:00Z', start_time: '2024-05-20T10:05:00Z', end_time: '2024-05-20T11:05:00Z' },
    { id: 2, status: 'running', video_names: [], eval_stage: 1, train_task_id: 102, create_time: '2024-05-21T11:00:00Z', start_time: '2024-05-21T11:05:00Z', end_time: null },
  ];
  
  export const mockCompletedTrainProjects = [
    {
      id: 101,
      model_type_id: 1, // ACT
      create_time: '2024-05-10T09:00:00Z',
      end_time: '2024-05-10T17:00:00Z',
      status: 'completed',
    },
    {
      id: 102,
      model_type_id: 2, // Diffusion
      create_time: '2024-05-11T09:00:00Z',
      end_time: '2024-05-11T17:00:00Z',
      status: 'completed',
    },
  ];
  
  export const mockEmptyTrainProjects = [];
  
  export const mockCreatedEvalTask = {
    id: 3,
    status: 'pending',
    train_task_id: 101,
    eval_stage: 2,
  };
  
  export const mockTrainTaskDetail = {
    id: 101,
    dataset_id: 1,
    model_type_id: 1,
    status: 'completed',
  };
  
  export const mockVideoBlob = new Blob(['mock video content'], { type: 'video/mp4' });
  
  export const mockDownloadResponse = {
    blob: new Blob(['mock video content for download'], { type: 'video/mp4' }),
    filename: 'downloaded_video.mp4',
  };