# training_platform/evaluator/evaluator_logic.py

import json
import logging
import threading
import time
import zipfile
import asyncio
from contextlib import nullcontext
from copy import deepcopy
from dataclasses import asdict
from pathlib import Path
from pprint import pformat
from typing import Callable, Dict, Any, Optional, Tuple

import einops
import gymnasium as gym
import numpy as np
import torch
from termcolor import colored
from torch import Tensor, nn
from tqdm import trange

from lerobot.common.envs.factory import make_env
from lerobot.common.envs.utils import preprocess_observation
from lerobot.common.policies.factory import make_policy
from lerobot.common.policies.pretrained import PreTrainedPolicy
from lerobot.common.policies.utils import get_device_from_parameters
from lerobot.common.utils.io_utils import write_video
from lerobot.common.utils.random_utils import set_seed
from lerobot.common.utils.utils import (
    get_safe_torch_device,
    init_logging,
    inside_slurm,
)
from lerobot.configs.eval import EvalPipelineConfig
from training_platform.configs.settings import settings
from training_platform.common.minio_utils import get_minio_client, upload_file_to_minio

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('evaluation.log')
    ]
)

logger = logging.getLogger(__name__)


async def create_eval_result_zip(output_dir: str, eval_task_id: str) -> str:
    """
    创建评估结果的zip文件，包含评估信息和视频文件。
    
    Args:
        output_dir: 评估输出目录
        eval_task_id: 评估任务ID
        
    Returns:
        zip文件的本地路径
    """
    output_path = Path(output_dir)
    zip_filename = f"eval_result_{eval_task_id}.zip"
    zip_path = output_path / zip_filename
    
    logger.info(f"正在创建评估结果zip文件: {zip_path}")
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # 添加eval_info.json文件
        eval_info_path = output_path / "eval_info.json"
        if eval_info_path.exists():
            zipf.write(eval_info_path, "eval_info.json")
            logger.info("已添加eval_info.json到zip文件")
        else:
            logger.warning("eval_info.json文件不存在")
        
        # 添加videos目录下的所有文件
        videos_dir = output_path / "videos"
        if videos_dir.exists() and videos_dir.is_dir():
            video_count = 0
            for video_file in videos_dir.glob("*.mp4"):
                # 在zip中保持videos/目录结构
                zipf.write(video_file, f"videos/{video_file.name}")
                video_count += 1
            logger.info(f"已添加{video_count}个视频文件到zip文件")
        else:
            logger.warning("videos目录不存在或为空")
    
    logger.info(f"评估结果zip文件创建完成: {zip_path}")
    return str(zip_path)


async def upload_eval_result_to_minio(zip_file_path: str, eval_task_id: str) -> Tuple[bool, str]:
    """
    将评估结果zip文件上传到minio。
    
    Args:
        zip_file_path: 本地zip文件路径
        eval_task_id: 评估任务ID
        
    Returns:
        (success, message): 上传结果和消息
    """
    try:
        # 获取minio客户端
        client = await get_minio_client()
        if not client:
            return False, "无法连接到MinIO服务器"
        
        # 上传到 evals/{eval_task_id}/result.zip
        success, result = await upload_file_to_minio(
            client=client,
            upload_file_local_path=zip_file_path,
            filename="result.zip",
            bucket_name=settings.MINIO_BUCKET,
            object_dir=f"evals/{eval_task_id}"
        )
        
        if success:
            logger.info(f"评估结果已成功上传到MinIO: {result}")
            return True, result
        else:
            logger.error(f"上传到MinIO失败: {result}")
            return False, result
            
    except Exception as e:
        error_msg = f"上传评估结果到MinIO时发生错误: {e}"
        logger.error(error_msg)
        return False, error_msg


def load_env_config_from_model(model_path: str) -> Dict[str, Any]:
    """
    从解压缩的模型中自动获取训练时的环境配置。
    
    Args:
        model_path: 模型路径（解压缩后的目录）
        
    Returns:
        环境配置字典
    """
    model_path_obj = Path(model_path)
    
    # 尝试从 train_config.json 中获取环境配置
    train_config_path = model_path_obj / "train_config.json"
    if train_config_path.exists():
        logger.info(f"从 {train_config_path} 加载训练配置")
        with open(train_config_path, 'r', encoding='utf-8') as f:
            train_config = json.load(f)
        
        # 提取环境配置
        if 'env' in train_config:
            env_config = train_config['env'].copy()
            logger.info(f"从训练配置中提取的环境配置: {env_config}")
            return env_config
        else:
            logger.warning("训练配置中未找到 'env' 字段")
    
    # 尝试从 config.json 中获取环境配置
    config_path = model_path_obj / "config.json"
    if config_path.exists():
        logger.info(f"从 {config_path} 加载策略配置")
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        # 检查是否包含环境相关信息
        if 'env' in config:
            env_config = config['env'].copy()
            logger.info(f"从策略配置中提取的环境配置: {env_config}")
            return env_config
    
    # 如果都没有找到，返回默认配置
    logger.warning("未找到环境配置，使用默认配置")
    return {
        "type": "aloha",
        "task": "AlohaInsertion-v0",
        "fps": 50,
        "episode_length": 400,
        "obs_type": "pixels_agent_pos",
        "render_mode": "rgb_array"  # 设置为rgb_array以支持视频渲染
    }


def load_eval_config_from_json(eval_config_path: str) -> Dict[str, Any]:
    """
    从JSON文件读取评估配置。
    
    Args:
        eval_config_path: 评估配置文件路径
        
    Returns:
        评估配置字典
    """
    eval_config_path_obj = Path(eval_config_path)
    
    if not eval_config_path_obj.exists():
        logger.warning(f"评估配置文件不存在: {eval_config_path_obj}，使用默认配置")
        return {
            "n_episodes": 10,
            "batch_size": 4,
            "use_async_envs": False
        }
    
    try:
        with open(eval_config_path_obj, 'r', encoding='utf-8') as f:
            eval_config = json.load(f)
        
        logger.info(f"从 {eval_config_path_obj} 加载评估配置: {eval_config}")
        return eval_config
        
    except Exception as e:
        logger.error(f"读取评估配置文件失败: {e}")
        logger.warning("使用默认评估配置")
        return {
            "n_episodes": 10,
            "batch_size": 4,
            "use_async_envs": False
        }


def auto_detect_model_config(model_path: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    自动检测模型配置，包括环境配置和评估配置。
    
    Args:
        model_path: 模型路径
        
    Returns:
        (env_config, eval_config) 元组
    """
    model_path_obj = Path(model_path)
    
    # 1. 自动获取环境配置
    env_config = load_env_config_from_model(model_path)
    
    # 2. 尝试从模型目录中查找评估配置文件
    eval_config_path = model_path_obj / "eval_config.json"
    if eval_config_path.exists():
        eval_config = load_eval_config_from_json(str(eval_config_path))
    else:
        # 3. 尝试从训练配置中提取评估配置
        train_config_path = model_path_obj / "train_config.json"
        if train_config_path.exists():
            with open(train_config_path, 'r', encoding='utf-8') as f:
                train_config = json.load(f)
            
            if 'eval' in train_config:
                eval_config = train_config['eval'].copy()
                logger.info(f"从训练配置中提取的评估配置: {eval_config}")
            else:
                logger.warning("训练配置中未找到 'eval' 字段，使用默认评估配置")
                eval_config = {
                    "n_episodes": 10,
                    "batch_size": 4,
                    "use_async_envs": False
                }
        else:
            logger.warning("未找到评估配置，使用默认配置")
            # 从eval_config_example.json中加载默认配置
            eval_config_path = model_path_obj / "eval_config_example.json"
            if eval_config_path.exists():
                with open(eval_config_path, 'r', encoding='utf-8') as f:
                    eval_config = json.load(f)
            else:
                eval_config = {
                    "n_episodes": 10,
                    "batch_size": 4,
                    "use_async_envs": False
                }
    
    return env_config, eval_config


def rollout(
    env: gym.vector.VectorEnv,
    policy: PreTrainedPolicy,
    seeds: list[int] | None = None,
    return_observations: bool = False,
    render_callback: Callable[[gym.vector.VectorEnv], None] | None = None,
) -> dict:
    """运行批量策略 rollout 一次通过一批环境。

    注意，批次中的所有环境都会运行，直到最后一个环境完成。这意味着一些数据可能需要被丢弃
    （对于不是第一个完成的环境）。

    返回的字典包含：
        (可选) "observation": 一个字典，包含 (batch, sequence + 1, *) 张量映射到观察键。
            注意，这比其他字典中的键多了一个序列元素。这是因为在环境终止或截断后
            包含了一个额外的观察。
        "action": 一个 (batch, sequence, action_dim) 张量，包含基于观察应用的动作
            （不包括最后的观察）。
        "reward": 一个 (batch, sequence) 张量，包含应用动作获得的奖励。
        "success": 一个 (batch, sequence) 张量，包含成功条件（只有在环境终止/截断时
            才可能为 True）。
        "done": 一个 (batch, sequence) 张量，包含累积的完成条件。对于任何给定的批次元素，
            第一个 True 后面跟着 True 直到结束。这可用于屏蔽上述序列中的无关元素。

    Args:
        env: 环境批次。
        policy: 策略。必须是 PyTorch nn 模块。
        seeds: 环境在 rollout 开始时被播种一次。如果提供，此参数指定每个环境的种子。
        return_observations: 是否在返回的 rollout 数据中包含所有观察。观察是可选的，
            因为它们通常需要更多内存来缓存。默认为 False。
        render_callback: 可选的渲染回调，在环境重置后和每一步后使用。
    Returns:
        上面描述的字典。
    """
    assert isinstance(policy, nn.Module), "Policy must be a PyTorch nn module."
    device = get_device_from_parameters(policy)

    # 重置策略和环境。
    policy.reset()

    observation, info = env.reset(seed=seeds)
    if render_callback is not None:
        render_callback(env)

    all_observations = []
    all_actions = []
    all_rewards = []
    all_successes = []
    all_dones = []

    step = 0
    # 跟踪哪些环境已完成。
    done = np.array([False] * env.num_envs)
    max_steps = env.call("_max_episode_steps")[0]
    progbar = trange(
        max_steps,
        desc=f"Running rollout with at most {max_steps} steps",
        disable=inside_slurm(),  # 使用 slurm 时我们不想要进度条，因为它会弄乱日志
        leave=False,
    )
    while not np.all(done):
        # Numpy 数组到张量，并将字典键更改为 LeRobot 策略格式。
        observation = preprocess_observation(observation)
        if return_observations:
            all_observations.append(deepcopy(observation))

        observation = {
            key: observation[key].to(device, non_blocking=device.type == "cuda") for key in observation
        }

        with torch.inference_mode():
            action = policy.select_action(observation)

        # 转换为 CPU / numpy。
        action = action.to("cpu").numpy()
        assert action.ndim == 2, "Action dimensions should be (batch, action_dim)"

        # 应用下一个动作。
        observation, reward, terminated, truncated, info = env.step(action)
        if render_callback is not None:
            render_callback(env)

        # VectorEnv 在 `info["final_info"][env_index]["is_success"]` 中存储 is_success。
        # 如果没有环境完成，"final_info" 不可用。
        if "final_info" in info:
            successes = [info["is_success"] if info is not None else False for info in info["final_info"]]
        else:
            successes = [False] * env.num_envs

        # 跟踪到目前为止哪些环境已完成。
        done = terminated | truncated | done

        all_actions.append(torch.from_numpy(action))
        all_rewards.append(torch.from_numpy(reward))
        all_dones.append(torch.from_numpy(done))
        all_successes.append(torch.tensor(successes))

        step += 1
        running_success_rate = (
            einops.reduce(torch.stack(all_successes, dim=1), "b n -> b", "any").numpy().mean()
        )
        progbar.set_postfix({"running_success_rate": f"{running_success_rate.item() * 100:.1f}%"})
        progbar.update()

    # 跟踪最终观察。
    if return_observations:
        observation = preprocess_observation(observation)
        all_observations.append(deepcopy(observation))

    # 沿第一个维度堆叠序列，这样我们就有 (batch, sequence, *) 张量。
    ret = {
        "action": torch.stack(all_actions, dim=1),
        "reward": torch.stack(all_rewards, dim=1),
        "success": torch.stack(all_successes, dim=1),
        "done": torch.stack(all_dones, dim=1),
    }
    if return_observations:
        stacked_observations = {}
        for key in all_observations[0]:
            stacked_observations[key] = torch.stack([obs[key] for obs in all_observations], dim=1)
        ret["observation"] = stacked_observations

    if hasattr(policy, "use_original_modules"):
        policy.use_original_modules()

    return ret


def eval_policy(
    env: gym.vector.VectorEnv,
    policy: PreTrainedPolicy,
    n_episodes: int,
    max_episodes_rendered: int = 0,
    videos_dir: Path | None = None,
    return_episode_data: bool = False,
    start_seed: int | None = None,
) -> dict:
    """
    Args:
        env: 环境批次。
        policy: 策略。
        n_episodes: 要评估的剧集数量。
        max_episodes_rendered: 渲染到视频中的最大剧集数量。
        videos_dir: 保存渲染视频的位置。
        return_episode_data: 是否返回在线训练的剧集数据。将数据合并到返回字典的 "episodes" 键中。
        start_seed: 用于第一个单独 rollout 的第一个种子。对于所有后续 rollout，
            种子递增 1。如果未提供，环境不会手动播种。
    Returns:
        包含有关 rollout 的指标和数据的字典。
    """
    if max_episodes_rendered > 0 and not videos_dir:
        raise ValueError("If max_episodes_rendered > 0, videos_dir must be provided.")

    if not isinstance(policy, PreTrainedPolicy):
        raise ValueError(
            f"Policy of type 'PreTrainedPolicy' is expected, but type '{type(policy)}' was provided."
        )

    start = time.time()
    policy.eval()

    # 确定我们需要多少批量 rollout 来获得 n_episodes。注意，如果 n_episodes 不能
    # 被 env.num_envs 整除，我们最终会在最后一批中丢弃一些数据。
    n_batches = n_episodes // env.num_envs + int((n_episodes % env.num_envs) != 0)

    # 跟踪一些指标。
    sum_rewards = []
    max_rewards = []
    all_successes = []
    all_seeds = []
    threads = []  # 用于视频保存线程
    n_episodes_rendered = 0  # 用于保存正确数量的视频

    # 可视化回调。
    def render_frame(env: gym.vector.VectorEnv):
        # noqa: B023
        if n_episodes_rendered >= max_episodes_rendered:
            return
        n_to_render_now = min(max_episodes_rendered - n_episodes_rendered, env.num_envs)
        if isinstance(env, gym.vector.SyncVectorEnv):
            frames = []
            for i in range(n_to_render_now):
                frame = env.envs[i].render()
                if frame is not None:
                    frames.append(frame)
            if frames:
                ep_frames.append(np.stack(frames))  # noqa: B023
        elif isinstance(env, gym.vector.AsyncVectorEnv):
            # 这里我们必须渲染所有帧并丢弃我们不需要的任何帧。
            frames = env.call("render")[:n_to_render_now]
            frames = [f for f in frames if f is not None]
            if frames:
                ep_frames.append(np.stack(frames))

    if max_episodes_rendered > 0:
        video_paths: list[str] = []

    if return_episode_data:
        episode_data: dict | None = None

    # 使用 slurm 时我们不想要进度条，因为它会弄乱日志
    progbar = trange(n_batches, desc="Stepping through eval batches", disable=inside_slurm())
    for batch_ix in progbar:
        # 缓存帧以渲染视频。每个项目将是 (b, h, w, c)，列表索引 rollout 步骤。
        if max_episodes_rendered > 0:
            ep_frames: list[np.ndarray] = []

        if start_seed is None:
            seeds = None
        else:
            seeds = range(
                start_seed + (batch_ix * env.num_envs), start_seed + ((batch_ix + 1) * env.num_envs)
            )
        rollout_data = rollout(
            env,
            policy,
            seeds=list(seeds) if seeds else None,
            return_observations=return_episode_data,
            render_callback=render_frame if max_episodes_rendered > 0 else None,
        )

        # 找出每个 rollout 序列中第一次遇到完成条件的位置（此后的结果不会包含）。
        n_steps = rollout_data["done"].shape[1]
        # 注意：这依赖于 argmax 的一个属性：它返回第一个出现作为平局决胜。
        done_indices = torch.argmax(rollout_data["done"].to(int), dim=1)

        # 制作一个形状为 (batch, n_steps) 的掩码，以在第一次完成后屏蔽 rollout 数据
        # （按批次元素）。注意 `done_indices + 1` 以确保保留完成步骤的数据。
        mask = (torch.arange(n_steps) <= einops.repeat(done_indices + 1, "b -> b s", s=n_steps)).int()
        # 扩展指标。
        batch_sum_rewards = einops.reduce((rollout_data["reward"] * mask), "b n -> b", "sum")
        sum_rewards.extend(batch_sum_rewards.tolist())
        batch_max_rewards = einops.reduce((rollout_data["reward"] * mask), "b n -> b", "max")
        max_rewards.extend(batch_max_rewards.tolist())
        batch_successes = einops.reduce((rollout_data["success"] * mask), "b n -> b", "any")
        all_successes.extend(batch_successes.tolist())
        if seeds:
            all_seeds.extend(seeds)
        else:
            all_seeds.append(None)

        # FIXME: episode_data 要么是 None 要么不存在
        if return_episode_data:
            this_episode_data = _compile_episode_data(
                rollout_data,
                done_indices,
                start_episode_index=batch_ix * env.num_envs,
                start_data_index=(0 if episode_data is None else (episode_data["index"][-1].item() + 1)),
                fps=env.unwrapped.metadata["render_fps"],
            )
            if episode_data is None:
                episode_data = this_episode_data
            else:
                # 一些健全性检查以确保我们正确编译数据。
                assert episode_data["episode_index"][-1] + 1 == this_episode_data["episode_index"][0]
                assert episode_data["index"][-1] + 1 == this_episode_data["index"][0]
                # 连接剧集数据。
                episode_data = {k: torch.cat([episode_data[k], this_episode_data[k]]) for k in episode_data}

        # 也许渲染视频以进行可视化。
        if max_episodes_rendered > 0 and len(ep_frames) > 0 and videos_dir is not None:
            batch_stacked_frames = np.stack(ep_frames, axis=1)  # (b, t, *)
            for stacked_frames, done_index in zip(
                batch_stacked_frames, done_indices.flatten().tolist(), strict=False
            ):
                if n_episodes_rendered >= max_episodes_rendered:
                    break

                videos_dir.mkdir(parents=True, exist_ok=True)
                video_path = videos_dir / f"eval_episode_{n_episodes_rendered}.mp4"
                video_paths.append(str(video_path))
                thread = threading.Thread(
                    target=write_video,
                    args=(
                        str(video_path),
                        stacked_frames[: done_index + 1],  # + 1 以捕获最后一个观察
                        env.unwrapped.metadata["render_fps"],
                    ),
                )
                thread.start()
                threads.append(thread)
                n_episodes_rendered += 1

        progbar.set_postfix(
            {"running_success_rate": f"{np.mean(all_successes[:n_episodes]).item() * 100:.1f}%"}
        )

    # 等待所有视频渲染线程完成。
    for thread in threads:
        thread.join()

    # 编译评估信息。
    info = {
        "per_episode": [
            {
                "episode_ix": i,
                "sum_reward": sum_reward,
                "max_reward": max_reward,
                "success": success,
                "seed": seed,
            }
            for i, (sum_reward, max_reward, success, seed) in enumerate(
                zip(
                    sum_rewards[:n_episodes],
                    max_rewards[:n_episodes],
                    all_successes[:n_episodes],
                    all_seeds[:n_episodes],
                    strict=True,
                )
            )
        ],
        "aggregated": {
            "avg_sum_reward": float(np.nanmean(sum_rewards[:n_episodes])),
            "avg_max_reward": float(np.nanmean(max_rewards[:n_episodes])),
            "pc_success": float(np.nanmean(all_successes[:n_episodes]) * 100),
            "eval_s": time.time() - start,
            "eval_ep_s": (time.time() - start) / n_episodes,
        },
    }

    if return_episode_data:
        info["episodes"] = episode_data

    if max_episodes_rendered > 0:
        info["video_paths"] = video_paths

    return info


def _compile_episode_data(
    rollout_data: dict, done_indices: Tensor, start_episode_index: int, start_data_index: int, fps: float
) -> dict:
    """`eval_policy(return_episode_data=True)` 的便利函数

    将所有 rollout 数据编译到 Hugging Face 数据集中。

    类似的逻辑在数据集推送到 hub 时实现（参见：`push_to_hub`）。
    """
    ep_dicts = []
    total_frames = 0
    for ep_ix in range(rollout_data["action"].shape[0]):
        # + 2 以包括第一个完成帧和最后一个观察帧。
        num_frames = done_indices[ep_ix].item() + 2
        total_frames += num_frames

        # 这里我们做 `num_frames - 1` 因为我们还不想包括最后一个观察帧。
        num_frames_int = int(num_frames - 1)
        ep_dict = {
            "action": rollout_data["action"][ep_ix, : num_frames - 1],
            "episode_index": torch.full((num_frames_int,), start_episode_index + ep_ix, dtype=torch.long),
            "frame_index": torch.arange(0, num_frames - 1, 1),
            "timestamp": torch.arange(0, num_frames - 1, 1) / fps,
            "next.done": rollout_data["done"][ep_ix, : num_frames - 1],
            "next.success": rollout_data["success"][ep_ix, : num_frames - 1],
            "next.reward": rollout_data["reward"][ep_ix, : num_frames - 1].type(torch.float32),
        }

        # 对于最后一个观察帧，所有其他键将只是复制填充。
        for k in ep_dict:
            ep_dict[k] = torch.cat([ep_dict[k], ep_dict[k][-1:]])

        for key in rollout_data["observation"]:
            ep_dict[key] = rollout_data["observation"][key][ep_ix, :num_frames]

        ep_dicts.append(ep_dict)

    data_dict = {}
    for key in ep_dicts[0]:
        data_dict[key] = torch.cat([x[key] for x in ep_dicts])

    data_dict["index"] = torch.arange(start_data_index, start_data_index + total_frames, 1)

    return data_dict


def prepare_eval_config(
    model_path: str,
    env_config: Optional[Dict[str, Any]] = None,
    eval_config: Optional[Dict[str, Any]] = None,
    output_dir: str = "",
    seed: int = 1000,
) -> EvalPipelineConfig:
    """
    准备评估配置对象。
    
    Args:
        model_path: 模型路径
        env_config: 环境配置（可选，如果不提供则自动检测）
        eval_config: 评估配置（可选，如果不提供则自动检测）
        output_dir: 输出目录
        seed: 随机种子
        
    Returns:
        配置好的 EvalPipelineConfig 对象
    """
    from lerobot.common.envs.factory import make_env_config
    from lerobot.configs.default import EvalConfig
    from lerobot.configs.policies import PreTrainedConfig
    
    # 如果未提供配置，则自动检测
    if env_config is None or eval_config is None:
        logger.info("自动检测模型配置...")
        auto_env_config, auto_eval_config = auto_detect_model_config(model_path)
        
        if env_config is None:
            env_config = auto_env_config
            logger.info(f"使用自动检测的环境配置: {env_config}")
        
        if eval_config is None:
            eval_config = auto_eval_config
            logger.info(f"使用自动检测的评估配置: {eval_config}")
    
    # 创建环境配置 - 使用 make_env_config 而不是直接实例化抽象类
    env_type = env_config.pop("type")  # 获取环境类型
    env_cfg = make_env_config(env_type, **env_config)
    
    # 创建评估配置
    eval_cfg = EvalConfig(**eval_config)
    
    # # 修复配置文件中的 type 字段问题
    # config_path = Path(model_path) / "config.json"
    # if config_path.exists():
    #     try:
    #         with open(config_path, 'r', encoding='utf-8') as f:
    #             config_content = json.load(f)
            
    #         # 检查是否包含 'type' 字段
    #         if 'type' not in config_content:
    #             logger.warning(f"配置文件缺少 'type' 字段，尝试推断策略类型")
                
    #             # 尝试从配置内容推断策略类型
    #             # 基于常见的配置特征来推断
    #             if 'chunk_size' in config_content and 'n_action_steps' in config_content:
    #                 config_content['type'] = 'act'
    #                 logger.info("基于配置特征推断为 ACT 策略")
    #             elif 'horizon' in config_content and 'num_train_timesteps' in config_content:
    #                 config_content['type'] = 'diffusion'
    #                 logger.info("基于配置特征推断为 Diffusion 策略")
    #             elif 'n_heads' in config_content and 'dim_model' in config_content:
    #                 config_content['type'] = 'act'
    #                 logger.info("基于配置特征推断为 ACT 策略")
    #             else:
    #                 # 默认使用 ACT
    #                 config_content['type'] = 'act'
    #                 logger.info("使用默认策略类型: ACT")
                
    #             # 保存修改后的配置
    #             with open(config_path, 'w', encoding='utf-8') as f:
    #                 json.dump(config_content, f, indent=2)
                
    #             logger.info(f"已修复配置文件，添加 type 字段: {config_content['type']}")
    #         else:
    #             logger.info(f"配置文件已包含 type 字段: {config_content['type']}")
                
    #     except Exception as e:
    #         logger.warning(f"无法读取或修改配置文件: {e}")
    #         # 如果无法修改配置文件，我们将在创建策略配置时处理这个问题
    
    # 创建策略配置
    try:
        policy_cfg = PreTrainedConfig.from_pretrained(model_path)
        
        # 修复设备配置问题
        if policy_cfg.device is None:
            policy_cfg.device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info(f"自动设置策略设备为: {policy_cfg.device}")
        
        # 设置 pretrained_path 属性
        setattr(policy_cfg, 'pretrained_path', model_path)
        logger.info(f"设置策略的预训练路径: {model_path}")
            
    except Exception as e:
        logger.error(f"从预训练模型加载策略配置失败: {e}")
        # 如果加载失败，尝试创建一个基本的配置
        logger.info("尝试创建基本策略配置...")
        
        # 创建一个基本的 ACT 配置作为后备
        from lerobot.common.policies.act.configuration_act import ACTConfig
        policy_cfg = ACTConfig()
        
        # 修复设备配置问题
        policy_cfg.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"自动设置后备策略设备为: {policy_cfg.device}")
        
        # 设置 pretrained_path 属性
        setattr(policy_cfg, 'pretrained_path', model_path)
        logger.info(f"设置后备策略的预训练路径: {model_path}")
        logger.warning("使用基本 ACT 配置作为后备")
    
    # 创建输出目录
    output_path = Path(output_dir) if output_dir else None
    if output_path:
        output_path.mkdir(parents=True, exist_ok=True)
    
    logger.info("env_config: {}".format(env_cfg))
    logger.info("eval_config: {}".format(eval_cfg))
    logger.info("policy_config: {}".format(policy_cfg))
    logger.info("output_path: {}".format(output_path))
    logger.info("seed: {}".format(seed))
    # 创建评估管道配置
    cfg = EvalPipelineConfig(
        env=env_cfg,
        eval=eval_cfg,
        policy=policy_cfg,
        output_dir=output_path,
        seed=seed
    )
    print("创建评估管道配置：{}".format(cfg))
    
    return cfg

async def run_lerobot_evaluation(
    model_path: str,
    env_config: Optional[Dict[str, Any]] = None,
    eval_config: Optional[Dict[str, Any]] = None,
    output_dir: str = "",
    seed: int = 1000,
    max_episodes_rendered: int = 10,
    return_episode_data: bool = False,
    eval_task_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    运行 LeRobot 评估。
    
    Args:
        model_path: 模型路径
        env_config: 环境配置（可选，如果不提供则自动检测）
        eval_config: 评估配置（可选，如果不提供则自动检测）
        output_dir: 输出目录
        seed: 随机种子
        max_episodes_rendered: 最大渲染剧集数
        return_episode_data: 是否返回剧集数据
        eval_task_id: 评估任务ID（用于上传到minio）
        
    Returns:
        评估结果字典
    """
    # 设置MUJOCO_GL环境变量为osmesa以支持无头渲染
    import os
    os.environ["MUJOCO_GL"] = "osmesa"
    logger.info("设置MUJOCO_GL环境变量为osmesa")
    
    logger.info("开始准备评估配置...")
    
    # 准备配置
    cfg = prepare_eval_config(
        model_path=model_path,
        env_config=env_config,
        eval_config=eval_config,
        output_dir=output_dir,
        seed=seed
    )
    
    logger.info(pformat(asdict(cfg)))
    
    # 确保策略配置不为None
    if cfg.policy is None:
        logger.error("策略配置为None，无法继续评估")
        raise ValueError("策略配置为None")
    
    logger.info(f"   - 策略配置的设备: {cfg.policy.device}")
    
    # 确保策略配置中的设备设置正确
    if cfg.policy.device is None:
        cfg.policy.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"自动设置策略设备为: {cfg.policy.device}")
    
    # 检查设备是否可用
    device = get_safe_torch_device(cfg.policy.device, log=True)
    logger.info(f"最终使用的设备: {device}")
    
    torch.backends.cudnn.benchmark = True
    torch.backends.cuda.matmul.allow_tf32 = True
    set_seed(cfg.seed)
    
    logger.info(colored("输出目录:", "yellow", attrs=["bold"]) + f" {cfg.output_dir}")
    
    logger.info("创建环境...")
    env = make_env(cfg.env, n_envs=cfg.eval.batch_size, use_async_envs=cfg.eval.use_async_envs)
    
    # 确保环境创建成功
    if env is None:
        logger.error("环境创建失败")
        raise RuntimeError("环境创建失败")
    
    logger.info("创建策略...")
    policy = make_policy(
        cfg=cfg.policy,
        env_cfg=cfg.env,
    )
    policy.eval()
    
    try:
        use_amp = hasattr(cfg.policy, 'use_amp') and cfg.policy.use_amp
        with torch.no_grad(), torch.autocast(device_type=device.type) if use_amp else nullcontext():
            videos_dir = Path(cfg.output_dir) / "videos" if max_episodes_rendered > 0 and cfg.output_dir else None
            info = eval_policy(
                env,
                policy,
                cfg.eval.n_episodes,
                max_episodes_rendered=max_episodes_rendered,
                videos_dir=videos_dir,
                return_episode_data=return_episode_data,
                start_seed=cfg.seed,
            )
        
        logger.info("评估完成！")
        logger.info(f"聚合结果: {info['aggregated']}")
        
        # 保存评估信息
        if cfg.output_dir:
            eval_info_path = Path(cfg.output_dir) / "eval_info.json"
            with open(eval_info_path, "w") as f:
                json.dump(info, f, indent=2)
            
            logger.info(f"评估信息已保存到: {eval_info_path}")
            
            # 如果提供了eval_task_id，则打包并上传到minio
            if eval_task_id:
                logger.info(f"开始打包评估结果并上传到minio，任务ID: {eval_task_id}")
                try:
                    # 创建zip文件
                    zip_file_path = await create_eval_result_zip(str(cfg.output_dir), eval_task_id)
                    
                    # 上传到minio
                    success, message = await upload_eval_result_to_minio(zip_file_path, eval_task_id)
                    
                    if success:
                        logger.info(f"评估结果已成功上传到minio: {message}")
                        info["minio_upload"] = {
                            "success": True,
                            "path": message,
                            "zip_file": zip_file_path
                        }
                    else:
                        logger.error(f"上传到minio失败: {message}")
                        info["minio_upload"] = {
                            "success": False,
                            "error": message,
                            "zip_file": zip_file_path
                        }
                        
                    # 清理本地zip文件（可选）
                    try:
                        Path(zip_file_path).unlink()
                        logger.info(f"已清理本地zip文件: {zip_file_path}")
                    except Exception as e:
                        logger.warning(f"清理本地zip文件失败: {e}")
                        
                except Exception as e:
                    error_msg = f"打包或上传评估结果时发生错误: {e}"
                    logger.error(error_msg)
                    info["minio_upload"] = {
                        "success": False,
                        "error": error_msg
                    }
        
        return info
        
    finally:
        if env is not None:
            env.close()
        logger.info("评估结束")


def run_lerobot_evaluation_sync(
    model_path: str,
    env_config: Optional[Dict[str, Any]] = None,
    eval_config: Optional[Dict[str, Any]] = None,
    output_dir: str = "",
    seed: int = 1000,
    max_episodes_rendered: int = 10,
    return_episode_data: bool = False,
    eval_task_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    同步版本的run_lerobot_evaluation函数，用于兼容不支持async的调用者。
    
    Args:
        参数同run_lerobot_evaluation
        
    Returns:
        评估结果字典
    """
    try:
        # 检查是否已经有事件循环运行
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # 没有运行的事件循环，创建新的
        return asyncio.run(run_lerobot_evaluation(
            model_path=model_path,
            env_config=env_config,
            eval_config=eval_config,
            output_dir=output_dir,
            seed=seed,
            max_episodes_rendered=max_episodes_rendered,
            return_episode_data=return_episode_data,
            eval_task_id=eval_task_id
        ))
    else:
        # 已有事件循环，在新线程中运行
        import concurrent.futures
        import threading
        
        def run_in_thread():
            return asyncio.run(run_lerobot_evaluation(
                model_path=model_path,
                env_config=env_config,
                eval_config=eval_config,
                output_dir=output_dir,
                seed=seed,
                max_episodes_rendered=max_episodes_rendered,
                return_episode_data=return_episode_data,
                eval_task_id=eval_task_id
            ))
        
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(run_in_thread)
            return future.result() 