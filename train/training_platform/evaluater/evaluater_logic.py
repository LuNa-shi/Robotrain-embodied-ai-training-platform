# training_platform/evaluater/evaluater_logic.py

import json
import logging
import threading
import time
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
            ep_frames.append(np.stack([env.envs[i].render() for i in range(n_to_render_now)]))  # noqa: B023
        elif isinstance(env, gym.vector.AsyncVectorEnv):
            # 这里我们必须渲染所有帧并丢弃我们不需要的任何帧。
            ep_frames.append(np.stack(env.call("render")[:n_to_render_now]))

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
        if max_episodes_rendered > 0 and len(ep_frames) > 0:
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
        ep_dict = {
            "action": rollout_data["action"][ep_ix, : num_frames - 1],
            "episode_index": torch.tensor([start_episode_index + ep_ix] * (num_frames - 1)),
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
    env_config: Dict[str, Any],
    eval_config: Dict[str, Any],
    output_dir: str,
    seed: int = 1000,
) -> EvalPipelineConfig:
    """
    准备评估配置对象。
    
    Args:
        model_path: 模型路径
        env_config: 环境配置
        eval_config: 评估配置
        output_dir: 输出目录
        seed: 随机种子
        
    Returns:
        配置好的 EvalPipelineConfig 对象
    """
    from lerobot.common import envs
    from lerobot.configs.default import EvalConfig
    from lerobot.configs.policies import PreTrainedConfig
    
    # 创建环境配置
    env_cfg = envs.EnvConfig(**env_config)
    
    # 创建评估配置
    eval_cfg = EvalConfig(**eval_config)
    
    # 创建策略配置
    policy_cfg = PreTrainedConfig.from_pretrained(model_path)
    policy_cfg.pretrained_path = model_path
    
    # 创建输出目录
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # 创建评估管道配置
    cfg = EvalPipelineConfig(
        env=env_cfg,
        eval=eval_cfg,
        policy=policy_cfg,
        output_dir=output_path,
        seed=seed
    )
    
    return cfg


def run_lerobot_evaluation(
    model_path: str,
    env_config: Dict[str, Any],
    eval_config: Dict[str, Any],
    output_dir: str,
    seed: int = 1000,
    max_episodes_rendered: int = 10,
    return_episode_data: bool = False,
) -> Dict[str, Any]:
    """
    运行 LeRobot 评估。
    
    Args:
        model_path: 模型路径
        env_config: 环境配置
        eval_config: 评估配置
        output_dir: 输出目录
        seed: 随机种子
        max_episodes_rendered: 最大渲染剧集数
        return_episode_data: 是否返回剧集数据
        
    Returns:
        评估结果字典
    """
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
    
    # 检查设备是否可用
    device = get_safe_torch_device(cfg.policy.device, log=True)
    
    torch.backends.cudnn.benchmark = True
    torch.backends.cuda.matmul.allow_tf32 = True
    set_seed(cfg.seed)
    
    logger.info(colored("输出目录:", "yellow", attrs=["bold"]) + f" {cfg.output_dir}")
    
    logger.info("创建环境...")
    env = make_env(cfg.env, n_envs=cfg.eval.batch_size, use_async_envs=cfg.eval.use_async_envs)
    
    logger.info("创建策略...")
    policy = make_policy(
        cfg=cfg.policy,
        env_cfg=cfg.env,
    )
    policy.eval()
    
    try:
        with torch.no_grad(), torch.autocast(device_type=device.type) if cfg.policy.use_amp else nullcontext():
            info = eval_policy(
                env,
                policy,
                cfg.eval.n_episodes,
                max_episodes_rendered=max_episodes_rendered,
                videos_dir=Path(cfg.output_dir) / "videos" if max_episodes_rendered > 0 else None,
                return_episode_data=return_episode_data,
                start_seed=cfg.seed,
            )
        
        logger.info("评估完成！")
        logger.info(f"聚合结果: {info['aggregated']}")
        
        # 保存评估信息
        eval_info_path = Path(cfg.output_dir) / "eval_info.json"
        with open(eval_info_path, "w") as f:
            json.dump(info, f, indent=2)
        
        logger.info(f"评估信息已保存到: {eval_info_path}")
        
        return info
        
    finally:
        env.close()
        logger.info("评估结束") 