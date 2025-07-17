from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Annotated

from app.core.deps import get_db
from app.service.dataset import DatasetService
from app.service.user import UserService
from app.schemas.dataset import DatasetPublic
from app.core.security import get_current_user
from app.models.user import AppUser
from app.schemas.dataset import DatasetCreate

# 创建路由实例
router = APIRouter()

# 依赖注入 DatasetService
async def get_dataset_service(db: Annotated[AsyncSession, Depends(get_db)]) -> DatasetService:
    return DatasetService(db)

# 依赖注入 UserService
async def get_user_service(db: Annotated[AsyncSession, Depends(get_db)]) -> UserService:
    return UserService(db)

@router.get("/me", summary="获取当前用户的数据集列表")
async def get_my_datasets(
    current_user: Annotated[AppUser, Depends(get_current_user)],
    dataset_service: Annotated[DatasetService, Depends(get_dataset_service)],
) -> list[DatasetPublic]:
    """
    **获取当前用户的数据集列表**

    返回当前登录用户拥有的数据集的公开信息列表。

    **响应:**
    - `200 OK`: 成功获取数据集列表。
    - `401 Unauthorized`: 用户未登录。
    """
    datasets = await dataset_service.get_datasets_by_user_id(current_user.id)
    return datasets

@router.get("/{dataset_id}", summary="获取数据集详情")
async def get_dataset(
    dataset_id: int,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    dataset_service: Annotated[DatasetService, Depends(get_dataset_service)],
    user_service: Annotated[UserService, Depends(get_user_service)],
) -> DatasetPublic:
    """
    **获取数据集详情**

    根据数据集ID获取数据集的详细信息。

    **路径参数:**
    - `dataset_id`: 要查询的数据集的ID。

    **响应:**
    - `200 OK`: 成功获取数据集详情。
    - `404 Not Found`: 数据集不存在。
    """
    # 验证用户是否拥有该数据集
    dataset_owned = await user_service.datasets_owned_by_user(current_user.id)
    if dataset_id not in [dataset.id for dataset in dataset_owned]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="该数据集不存在或该数据集不属于当前用户。",
        )
    dataset = await dataset_service.get_dataset_by_id(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="数据集未找到。",
        )
    return dataset

@router.get("/visualize/{dataset_id}/{chunck_id}/{episode_id}/{view_point}/video", 
            summary="获取数据集中的视频数据",
            response_class=FileResponse)
async def get_dataset_video(
    dataset_id: int,
    chunck_id: int,
    view_point: str,
    episode_id: int,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    dataset_service: Annotated[DatasetService, Depends(get_dataset_service)],
) -> FileResponse: # 也可以是 StreamingResponse
    """
    **获取数据集的可视化视频**

    根据数据集ID、块ID和片段ID获取视频文件。

    **路径参数:**
    - `dataset_id`: 数据集ID。
    - `chunck_id`: 块ID。
    - `episode_id`: 片段ID。

    **响应:**
    - `200 OK`: 成功获取视频文件。
    - `404 Not Found`: 文件不存在。
    """
    video_file = await dataset_service.get_video_by_dataset_id_and_chunk_id_and_episode_id(
        dataset_id=dataset_id,
        chunck_id=chunck_id,
        view_point=view_point,
        episode_id=episode_id
    )
    if not video_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="视频文件未找到。",
        )
    return video_file

@router.get("/visualize/{dataset_id}/{chunck_id}/{episode_id}/parquet", 
            summary="获取数据集中的Parquet数据",
            response_class=FileResponse)
async def get_dataset_parquet(
    dataset_id: int,
    chunck_id: int,
    episode_id: int,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    dataset_service: Annotated[DatasetService, Depends(get_dataset_service)],
) -> FileResponse:
    """
    **获取数据集的 Parquet 数据**

    根据数据集ID、块ID和片段ID获取 Parquet 格式的数据文件。

    **路径参数:**
    - `dataset_id`: 数据集ID。
    - `chunck_id`: 块ID。
    - `episode_id`: 片段ID。

    **响应:**
    - `200 OK`: 成功获取 Parquet 文件。
    - `404 Not Found`: 文件不存在。
    """
    parquet_file = await dataset_service.get_parquet_by_dataset_id_and_chunk_id_and_episode_id(
        dataset_id=dataset_id,
        chunck_id=chunck_id,
        episode_id=episode_id
    )
    if not parquet_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parquet 文件未找到。",
        )
    return parquet_file


@router.post("/upload", response_model=DatasetPublic, summary="创建新数据集")
async def upload_dataset(
    current_user: Annotated[AppUser, Depends(get_current_user)],
    dataset_service: Annotated[DatasetService, Depends(get_dataset_service)],
    name: str = Form(..., description="数据集名称"),
    description: str = Form(..., description="数据集描述"),
    file: UploadFile = File(..., description="上传的数据集文件"),
    is_aloha: bool = Form(False, description="是否为 Aloha 数据集"),
) -> DatasetPublic:
    """
    **创建新数据集**

    上传数据集文件并创建新的数据集记录。
    仅支持上传 zip 格式的文件。
    
    **表单参数:**
    - `name`: 数据集名称。
    - `description`: 数据集描述。
    - `file`: 上传的数据集文件。

    **响应:**
    - `201 Created`: 成功创建数据集。
    - `400 Bad Request`: 请求参数错误。
    - `401 Unauthorized`: 用户未登录。
    """
    if not file.filename.endswith(('.zip')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持上传 zip 格式的文件。",
        )
    
    dataset_create: DatasetCreate = DatasetCreate(
        dataset_name=name,
        description=description,
        is_aloha=is_aloha,
    )
    # service层
    dataset = await dataset_service.upload_dataset_for_user(
        user=current_user,
        dataset_create=dataset_create,
        upload_file=file
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="数据集上传失败，请稍后重试。",
        )
    return dataset

@router.delete("/{dataset_id}", summary="删除数据集")
async def delete_dataset(
    dataset_id: int,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    dataset_service: Annotated[DatasetService, Depends(get_dataset_service)],
    user_service: Annotated[UserService, Depends(get_user_service)],
) -> DatasetPublic:
    """
    **删除数据集**

    根据数据集ID删除指定的数据集。

    **路径参数:**
    - `dataset_id`: 要删除的数据集的ID。

    **响应:**
    - `204 No Content`: 成功删除数据集。
    - `404 Not Found`: 数据集不存在。
    - `401 Unauthorized`: 用户未登录。
    """
    # 验证用户是否拥有该数据集
    dataset_owned = await user_service.datasets_owned_by_user(current_user.id)

    if dataset_id not in [dataset.id for dataset in dataset_owned]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="该数据集不存在或该数据集不属于当前用户。",
        )
    
    deleted_dataset = await dataset_service.delete_dataset_by_id(dataset_id)
    if not delete_dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="数据集未找到。",
        )
    
    return deleted_dataset
    