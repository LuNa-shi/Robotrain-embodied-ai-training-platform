import emoji
import ray

@ray.remote
def f():
    return emoji.emojize('Python is :thumbs_up:')

# Execute 1000 copies of f across a cluster.
print(ray.get([f.remote() for _ in range(10)]))