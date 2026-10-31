"""
AST-based Static Code Metrics and Smells Analyzer.
Parses Python source code into an Abstract Syntax Tree to compute
McCabe's Cyclomatic Complexity, LOC metrics, Coupling, Function profiles,
and Code Smells without executing untrusted code.
"""

import ast
import re
from typing import Dict, Any, List

class ComplexityVisitor(ast.NodeVisitor):
    """Computes McCabe cyclomatic complexity for a given AST sub-tree."""
    def __init__(self):
        self.complexity = 1  # Base complexity

    def visit_If(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_IfExp(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_For(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_AsyncFor(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_While(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_ExceptHandler(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_With(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_AsyncWith(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_Assert(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_BoolOp(self, node):
        # 'and' or 'or' with N values adds N - 1 branches
        self.complexity += len(node.values) - 1
        self.generic_visit(node)

    def visit_Match(self, node):
        # Python 3.10+ pattern matching
        self.complexity += len(node.cases)
        self.generic_visit(node)


def calculate_node_complexity(node: ast.AST) -> int:
    visitor = ComplexityVisitor()
    visitor.visit(node)
    return visitor.complexity


def analyze_python_code(source_code: str) -> Dict[str, Any]:
    """
    Parses Python source code and extracts:
    - Lines of code (LOC, SLOC, comments, blanks)
    - Cyclomatic Complexity (average, max, and per function)
    - Function details (names, arguments, line count, complexity)
    - Class details
    - Coupling (imports and external references)
    - Code smells (long methods, high cyclomatic complexity, excessive arguments, deep nesting)
    """
    if not source_code or not source_code.strip():
        return {
            "error": "Source code is empty.",
            "metrics": {"loc": 0, "complexity": 1.0, "churn": 0, "coupling": 0, "code_smells": 0},
            "functions": [],
            "classes": [],
            "smells": [],
            "summary": "No code provided."
        }

    lines = source_code.splitlines()
    total_loc = len(lines)
    blank_lines = sum(1 for line in lines if not line.strip())
    comment_lines = sum(1 for line in lines if line.strip().startswith("#"))
    sloc = max(1, total_loc - blank_lines - comment_lines)

    # Attempt to parse AST
    try:
        tree = ast.parse(source_code)
    except SyntaxError as e:
        # Fallback for code with syntax issues
        return {
            "syntax_error": f"Line {e.lineno}, Col {e.offset}: {e.msg}",
            "metrics": {
                "loc": total_loc,
                "complexity": max(1.0, round(float(total_loc) / 25.0, 1)),
                "churn": 5,
                "coupling": len(re.findall(r"^(?:from|import)\s+\w+", source_code, re.M)),
                "code_smells": 1
            },
            "functions": [],
            "classes": [],
            "smells": [f"Syntax Error: {e.msg} at line {e.lineno}"],
            "summary": f"Partial analysis completed. Source contains syntax errors at line {e.lineno}."
        }

    functions = []
    classes = []
    smells = []
    imports = set()

    for node in ast.walk(tree):
        # Coupling metrics: imported modules
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imports.add(node.module.split(".")[0])

        # Class metrics
        elif isinstance(node, ast.ClassDef):
            classes.append({
                "name": node.name,
                "line": node.lineno,
                "methods_count": sum(1 for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)))
            })

    # Function-level analysis
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            func_info = _process_function(node, lines)
            functions.append(func_info)
        elif isinstance(node, ast.ClassDef):
            for sub_node in node.body:
                if isinstance(sub_node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    func_info = _process_function(sub_node, lines, class_name=node.name)
                    functions.append(func_info)

    # Code smells identification
    for func in functions:
        fname = func["name"]
        if func["complexity"] > 10:
            smells.append({
                "type": "High Cyclomatic Complexity",
                "severity": "High" if func["complexity"] > 15 else "Medium",
                "target": fname,
                "description": f"Function '{fname}' has a complexity score of {func['complexity']} (threshold: 10). High branching increases defect risk."
            })
        if func["loc"] > 40:
            smells.append({
                "type": "Long Method",
                "severity": "Medium",
                "target": fname,
                "description": f"Function '{fname}' is {func['loc']} lines long. Consider refactoring into modular helper functions."
            })
        if len(func["arguments"]) > 5:
            smells.append({
                "type": "Too Many Parameters",
                "severity": "Low",
                "target": fname,
                "description": f"Function '{fname}' accepts {len(func['arguments'])} parameters. High coupling to input parameters."
            })
        if func.get("max_nesting", 0) >= 4:
            smells.append({
                "type": "Deep Nesting",
                "severity": "High",
                "target": fname,
                "description": f"Function '{fname}' has nesting level of {func['max_nesting']}. Deeply nested control flows obscure defects."
            })

    # Overall cyclomatic complexity
    complexities = [f["complexity"] for f in functions]
    avg_complexity = round(float(sum(complexities) / len(complexities)), 1) if complexities else 1.0
    max_complexity = max(complexities) if complexities else 1.0

    coupling_score = len(imports)

    # Normalized metric package for prediction model
    metrics = {
        "loc": total_loc,
        "sloc": sloc,
        "comment_lines": comment_lines,
        "blank_lines": blank_lines,
        "complexity": avg_complexity,
        "max_complexity": max_complexity,
        "churn": min(90, max(2, int(total_loc * 0.04 + avg_complexity * 1.5))),
        "coupling": coupling_score,
        "code_smells": len(smells),
        "total_functions": len(functions),
        "total_classes": len(classes)
    }

    return {
        "metrics": metrics,
        "functions": functions,
        "classes": classes,
        "smells": smells,
        "imports": sorted(list(imports)),
        "summary": f"Successfully analyzed {total_loc} lines across {len(functions)} function(s) and {len(classes)} class(es). Identified {len(smells)} code smell(s)."
    }


def _process_function(node, lines: List[str], class_name: str = None) -> Dict[str, Any]:
    """Helper to profile individual functions."""
    func_complexity = calculate_node_complexity(node)
    
    # Calculate end line if available
    end_line = getattr(node, 'end_lineno', node.lineno)
    func_loc = max(1, end_line - node.lineno + 1)

    # Argument names
    args = [a.arg for a in node.args.args if a.arg != "self"]

    # Calculate maximum nesting depth within the function
    max_nesting = _calculate_max_nesting(node)

    full_name = f"{class_name}.{node.name}" if class_name else node.name
    docstring = ast.get_docstring(node) or ""

    return {
        "name": full_name,
        "simple_name": node.name,
        "class_name": class_name,
        "line_start": node.lineno,
        "line_end": end_line,
        "loc": func_loc,
        "complexity": func_complexity,
        "arguments": args,
        "docstring": docstring,
        "max_nesting": max_nesting
    }


def _calculate_max_nesting(node, current_depth=0) -> int:
    """Calculates maximum block nesting depth inside a function."""
    nesting_nodes = (ast.If, ast.While, ast.For, ast.AsyncFor, ast.Try, ast.With, ast.AsyncWith)
    max_d = current_depth

    for child in ast.iter_child_nodes(node):
        if isinstance(child, nesting_nodes):
            max_d = max(max_d, _calculate_max_nesting(child, current_depth + 1))
        else:
            max_d = max(max_d, _calculate_max_nesting(child, current_depth))
    return max_d
