import subprocess


def test_pluginval_compliance(plugin_path, pluginval_path):
    """Test VST3 compliance with pluginval at strictness level 5."""
    result = subprocess.run(
        [
            pluginval_path,
            "--strictness-level", "5",
            "--validate", plugin_path
        ],
        capture_output=True,
        text=True
    )

    # Print output for visibility
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr)

    assert result.returncode == 0, f"pluginval validation failed:\n{result.stderr}"
