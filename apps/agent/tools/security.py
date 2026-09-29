import os
from pathlib import Path
# ---------------------------------------------------------------------------
# 运行期上下文（环境变量）
# ---------------------------------------------------------------------------

def _allowed_roots() -> tuple[Path, ...]:
    #  拿到白名单字符串（比如 "/dir1:/dir2"），拿不到就默认为空
    raw = os.getenv("ILLUSION_AGENT_ALLOWED_ROOTS", "")
    roots: list[Path] = []
    for item in raw.split(os.pathsep):
        item = item.strip()
        if not item:
            continue
        try:
            roots.append(Path(item).expanduser().resolve())
        except OSError:
            continue
    return tuple(roots)

# 获取权限 你现在是什么权限，如果是'只读'或'全部'就照办，否则我默认只给你'只读'。"

def _permission() -> str:
    value = os.getenv("ILLUSION_AGENT_PERMISSION", "readonly")
    return value if value in ("readonly", "full") else "readonly"

# 把用户给的路径解析成绝对路径，并确认它落在白名单里（目录边界，不是字符串前缀）。
def _require_allowed(path: str) -> Path:
    # 确认 脏数据进入 解析为 Posixpath('...') 路径
    roots = _allowed_roots() # 返回若干个路径 例如 roots = (PosixPath('/home/gem/project'), PosixPath('/tmp/data'))
    if not roots:
        raise ValueError("当前没有配置可访问目录（ILLUSION_AGENT_ALLOWED_ROOTS 为空）")
    
    target = Path(path).expanduser().resolve()
    for root in roots:
        try:
            # target 是不是 root 这棵树下的东西
            # 列如 root     target       return
            #      /temp    /temp/src    PosixPath('src')
            #      /temp    /temp        PosixPath('.')
            #      /temp    /temp1       抛出异常
            target.relative_to(root)
            return target
        except ValueError:
            continue
    raise ValueError(f"目录不在允许清单内：{path}")