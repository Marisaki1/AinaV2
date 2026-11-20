import ast
import math
import random
import re


def integer(value, name, low=-1000000000, high=1000000000):
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or not low <= value <= high
    ):
        raise ValueError(f"{name} must be an integer from {low} to {high}.")
    return value


def dice_spec(formula):
    formula = str(formula).replace(" ", "").lower()
    match = re.fullmatch(
        r"(\d{0,3})d(\d{1,5}|%|f)(?:(kh|kl)(\d{1,3}))?([+-]\d{1,6})?", formula
    )
    if not match:
        raise ValueError("Use a dice formula such as 2d6+3, d20, 4d6kh3, d% or 4dF.")
    count = int(match[1] or "1")
    sides = 100 if match[2] == "%" else 3 if match[2] == "f" else int(match[2])
    keep = int(match[4] or count)
    if not 1 <= count <= 100 or not 2 <= sides <= 10000 or not 1 <= keep <= count:
        raise ValueError("Use up to 100 dice, 10,000 sides, and a valid keep count.")
    return formula, match, count, sides, keep


def dice_roll(formula, rng=None):
    formula, match, count, sides, keep = dice_spec(formula)
    rng = rng or random.SystemRandom()
    rolls = [
        rng.randrange(sides) + (0 if match[2] == "f" else 1) for _ in range(count)
    ]
    if match[2] == "f":
        rolls = [n - 1 for n in rolls]
    selected = sorted(range(count), key=lambda i: rolls[i], reverse=match[3] != "kl")[
        :keep
    ]
    modifier = int(match[5] or "0")
    return {
        "formula": formula,
        "rolls": rolls,
        "kept": selected,
        "modifier": modifier,
        "total": sum(rolls[i] for i in selected) + modifier,
    }


def weighted(rows, seed=None, rng=None):
    if not isinstance(rows, list) or not 1 <= len(rows) <= 5000:
        raise ValueError("Add at least one row before rolling.")
    weights = []
    for row in rows:
        value = row.get("weight", 1)
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            or not 0 <= value <= 1e9
        ):
            raise ValueError("Weights must be finite, non-negative numbers.")
        weights.append(value)
    if sum(weights) <= 0:
        raise ValueError("At least one row needs a positive weight.")
    rng = rng or (random.Random(seed) if seed is not None else random.SystemRandom())
    return rows[rng.choices(range(len(rows)), weights=weights, k=1)[0]]


def calculate(expression, values):
    if not isinstance(expression, str) or len(expression) > 300:
        raise ValueError("Formula is too long.")
    try:
        tree = ast.parse(expression, mode="eval")
    except (SyntaxError, ValueError) as error:
        raise ValueError("The formula is incomplete or invalid.") from error
    nodes = list(ast.walk(tree))
    if len(nodes) > 80:
        raise ValueError("Formula is too complex.")
    functions = {
        "min": min,
        "max": max,
        "floor": math.floor,
        "ceil": math.ceil,
        "abs": abs,
    }

    def walk(node):
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            result = node.value
        elif isinstance(node, ast.Name) and node.id in values:
            result = float(values[node.id])
        elif isinstance(node, ast.UnaryOp) and isinstance(
            node.op, (ast.USub, ast.UAdd)
        ):
            result = (-1 if isinstance(node.op, ast.USub) else 1) * walk(node.operand)
        elif isinstance(node, ast.BinOp) and isinstance(
            node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod)
        ):
            a, b = walk(node.left), walk(node.right)
            operation = {
                ast.Add: lambda: a + b,
                ast.Sub: lambda: a - b,
                ast.Mult: lambda: a * b,
                ast.Div: lambda: a / b,
                ast.FloorDiv: lambda: a // b,
                ast.Mod: lambda: a % b,
            }[type(node.op)]
            result = operation()
        elif (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id in functions
            and not node.keywords
            and 1 <= len(node.args) <= 10
        ):
            result = functions[node.func.id](*[walk(n) for n in node.args])
        else:
            raise ValueError(
                "Formula supports numbers, field names, arithmetic, min, max, floor, ceil and abs."
            )
        if not math.isfinite(result) or abs(result) > 1e12:
            raise ValueError("Formula result is outside the supported range.")
        return result

    try:
        return walk(tree.body)
    except (SyntaxError, ZeroDivisionError, TypeError, OverflowError) as error:
        raise ValueError("Invalid formula: " + str(error)) from error


def calendar_config(data):
    from .calendar_engine import config

    return config(data)


def date_info(data, year, month=1, day=1, special_day_id=None):
    from .calendar_engine import date_info as calculate_date

    return calculate_date(data, year, month, day, special_day_id)


def date_from_ordinal(data, ordinal):
    from .calendar_engine import date_from_ordinal as invert_date

    return invert_date(data, ordinal)
