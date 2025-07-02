# RoboTrain

## 配置项目环境

## Train
1. 修改训练配置文件
2. 运行训练脚本
```bash
python3 lerobot/scripts/train.py --config_path config/diffusion_pusht_config.json
```
## Evaluate
```bash
python3 lerobot/scripts/eval.py \
    --policy.path=lerobot/diffusion_pusht \
    --env.type=pusht \
    --eval.batch_size=10 \
    --eval.n_episodes=10
```
## Get Started
1. 复现ACT Policy in Aloha
```bash
python3 lerobot/scripts/train.py \                                       
    --output_dir=outputs/train/act_aloha_insertion \
    --policy.type=act \
    --dataset.repo_id=lerobot/aloha_sim_insertion_human \
    --env.type=aloha \
    --env.task=AlohaInsertion-v0 \
    --wandb.enable=true
```
