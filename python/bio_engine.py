import os
import sys
from pathlib import Path


def load_source_bio_core() -> object:
    """Load bio_core.py from source even if a compiled extension exists."""
    import importlib.util

    bio_core_path = Path(__file__).with_name("bio_core.py")
    spec = importlib.util.spec_from_file_location("bio_core_src", bio_core_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Failed to create module spec for {bio_core_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


use_source = os.environ.get("BIOVIZ_USE_SOURCE") in ("1", "true", "TRUE", "yes", "YES")

try:
    if use_source:
        bio_core = load_source_bio_core()
    else:
        # Try importing as a compiled module first (so/pyd)
        import bio_core  # type: ignore
except ImportError:
    # Fallback to source (useful for development)
    try:
        bio_core = load_source_bio_core()
    except ImportError as e:
        print(f"Failed to import bio_core: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if hasattr(bio_core, 'run'):
        bio_core.run()
    elif hasattr(bio_core, 'main'):
        bio_core.main()
    else:
        import sys
        print("bio_core module has no run() or main() function", file=sys.stderr)
        sys.exit(1)
