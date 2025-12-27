"""
Pytest wrapper for C++ unit tests.

Builds and runs the Catch2-based C++ unit tests, integrating results with pytest.
"""
import subprocess
import pytest
from pathlib import Path
import xml.etree.ElementTree as ET


UNIT_DIR = Path(__file__).parent
BINARY_PATH = UNIT_DIR / "build" / "unit_tests_artefacts" / "Release" / "unit_tests"
BUILD_SCRIPT = UNIT_DIR / "build.sh"
JUNIT_OUTPUT = UNIT_DIR / "build" / "test_results.xml"


def build_unit_tests():
    """Build the C++ unit tests if needed."""
    print(f"\nBuilding C++ unit tests...")
    result = subprocess.run(
        [str(BUILD_SCRIPT)],
        cwd=UNIT_DIR,
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        print(f"Build stdout:\n{result.stdout}")
        print(f"Build stderr:\n{result.stderr}")
        pytest.fail(f"Failed to build C++ unit tests: {result.stderr}")


class TestCppUnitTests:
    """Run C++ unit tests via Catch2 binary."""

    @pytest.fixture(autouse=True)
    def ensure_binary(self):
        """Ensure the unit test binary is built."""
        if not BINARY_PATH.exists():
            build_unit_tests()
        if not BINARY_PATH.exists():
            pytest.skip(f"Unit tests binary not found at {BINARY_PATH}")

    def test_cpp_unit_tests(self):
        """Run all C++ unit tests and report results."""
        # Run with JUnit reporter for structured output
        result = subprocess.run(
            [str(BINARY_PATH), "-r", "junit", "-o", str(JUNIT_OUTPUT)],
            cwd=UNIT_DIR,
            capture_output=True,
            text=True
        )

        # Run with console reporter for human-readable output
        console_result = subprocess.run(
            [str(BINARY_PATH)],
            cwd=UNIT_DIR,
            capture_output=True,
            text=True
        )

        # Always print output so user sees what ran
        if console_result.stdout:
            print(f"\n{console_result.stdout}")
        if console_result.stderr:
            print(f"\nStderr:\n{console_result.stderr}")

        # Parse JUnit XML for summary
        if JUNIT_OUTPUT.exists():
            try:
                tree = ET.parse(JUNIT_OUTPUT)
                root = tree.getroot()

                # Get test counts from testsuite element
                for testsuite in root.iter('testsuite'):
                    tests = int(testsuite.get('tests', 0))
                    failures = int(testsuite.get('failures', 0))
                    errors = int(testsuite.get('errors', 0))

                    print(f"\nC++ Unit Tests: {tests} tests, {failures} failures, {errors} errors")

                    # List any failures
                    for testcase in testsuite.iter('testcase'):
                        failure = testcase.find('failure')
                        if failure is not None:
                            name = testcase.get('name', 'unknown')
                            message = failure.get('message', failure.text or '')
                            print(f"  FAILED: {name}")
                            print(f"    {message[:200]}...")  # Truncate long messages
            except ET.ParseError as e:
                print(f"Warning: Could not parse JUnit XML: {e}")

        assert result.returncode == 0, f"C++ unit tests failed with exit code {result.returncode}"


def test_cpp_unit_tests_quick():
    """Quick check that C++ tests can run (used for CI smoke tests)."""
    if not BINARY_PATH.exists():
        pytest.skip(f"Unit tests binary not built. Run ./tests/unit/build.sh first.")

    # Just list tests to verify binary works
    result = subprocess.run(
        [str(BINARY_PATH), "--list-tests"],
        capture_output=True,
        text=True
    )
    assert result.returncode == 0, "Failed to list C++ unit tests"
    assert "test" in result.stdout.lower(), "No tests found in binary"
