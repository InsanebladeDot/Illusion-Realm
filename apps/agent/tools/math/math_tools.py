"""数学类工具：`calculate`（AST 白名单求值，替代原项目里的 eval）。

自动发现：文件名以 `_tools` 结尾即可，不需要在任何登记表里加一行 ——
规则见 `tools/registry.py`。
"""

from __future__ import annotations

import ast
import operator

from ..mcp_instance import mcp


# ---------------------------------------------------------------------------
# 工具一：精确计算（AST 白名单求值，替代原项目里的 eval）
# ---------------------------------------------------------------------------

_BINARY_OPS: dict[type, object] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
}
_UNARY_OPS: dict[type, object] = {ast.UAdd: operator.pos, ast.USub: operator.neg}
_MAX_POW_EXPONENT = 64
_MAX_ABS_VALUE = 10**12


def _eval_node(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
        return _UNARY_OPS[type(node.op)](_eval_node(node.operand))  # type: ignore[operator]
    if isinstance(node, ast.BinOp):
        if isinstance(node.op, ast.Pow):
            base = _eval_node(node.left)
            exponent = _eval_node(node.right)
            if abs(exponent) > _MAX_POW_EXPONENT:
                raise ValueError(f"指数过大（上限 {_MAX_POW_EXPONENT}）")
            return base**exponent
        handler = _BINARY_OPS.get(type(node.op))
        if handler is None:
            raise ValueError("不支持的运算符")
        return handler(_eval_node(node.left), _eval_node(node.right))  # type: ignore[operator]
    raise ValueError("表达式里只允许数字、括号与 + - * / // % ** 运算符")


@mcp.tool()
def calculate(expression: str) -> str:
    """计算一个纯算术表达式（支持 + - * / // % ** 与括号）。

    模型本身不擅长精确算术、也容易算错位数，所以涉及数字计算时应先调用本工具，
    再照抄工具返回的结果。

    Args:
        expression: 算术表达式，例如 "(26+18)*3-7"。
    """
    try:
        tree = ast.parse(expression, mode="eval")
        value = _eval_node(tree)
    except SyntaxError:
        return f"表达式语法错误：{expression}"
    except ValueError as exc:
        return f"表达式无法计算：{exc}"
    except ZeroDivisionError:
        return "表达式无法计算：除数为 0"
    if abs(value) > _MAX_ABS_VALUE:
        return "结果过大，拒绝返回（避免把巨数塞进上下文）"
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return f"{expression} = {value}"
