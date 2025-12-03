import subprocess
import pytest


def get_cpp_test_results(binary_path):
    """Run C++ tests and parse results."""
    result = subprocess.run(
        [binary_path],
        capture_output=True,
        text=True
    )

    tests = []
    for line in result.stdout.splitlines():
        if line.startswith("RESULT:"):
            parts = line.split(":", 3)  # RESULT:name:status[:message]
            if len(parts) >= 3:
                name = parts[1]
                status = parts[2]
                message = parts[3] if len(parts) > 3 else ""
                tests.append((name, status, message))

    return tests


def pytest_generate_tests(metafunc):
    """Dynamically generate test cases from C++ test results."""
    if "cpp_test_result" in metafunc.fixturenames:
        from pathlib import Path
        binary = Path(__file__).parent / "build/unit_tests_artefacts/Release/unit_tests"
        if binary.exists():
            results = get_cpp_test_results(str(binary))
            metafunc.parametrize(
                "cpp_test_result",
                results,
                ids=[r[0] for r in results]
            )
        else:
            metafunc.parametrize("cpp_test_result", [], ids=[])


def test_cpp(cpp_test_result):
    """C++ unit test."""
    name, status, message = cpp_test_result
    assert status == "PASS", f"{name}: {message}"
