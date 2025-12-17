import os
import sys
import logging
from pathlib import Path
from datetime import datetime

# Setup file logging for packaged app
def setup_logging():
    """Setup file logging to user's home directory."""
    log_dir = Path.home() / ".bioviz_local" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    
    log_file = log_dir / f"bio-engine_{datetime.now().strftime('%Y%m%d')}.log"
    
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s [%(levelname)s] %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),
            logging.StreamHandler(sys.stderr)
        ]
    )
    logging.info(f"=== BioViz Engine Starting ===")
    logging.info(f"Python version: {sys.version}")
    logging.info(f"Executable: {sys.executable}")
    logging.info(f"Working directory: {os.getcwd()}")
    logging.info(f"Log file: {log_file}")
    return log_file

setup_logging()


def load_source_bio_core() -> object:
    """Load bio_core.py from source even if a compiled extension exists."""
    import importlib.util

    # In packaged app, bio_core.py is in same directory as bio_engine
    bio_core_path = Path(__file__).with_name("bio_core.py")
    
    # Also check PyInstaller _MEIPASS directory
    if hasattr(sys, '_MEIPASS'):
        meipass_path = Path(sys._MEIPASS) / "bio_core.py"
        if meipass_path.exists():
            bio_core_path = meipass_path
            logging.info(f"Using PyInstaller bundled path: {bio_core_path}")
    
    logging.info(f"Loading bio_core from: {bio_core_path}")
    
    if not bio_core_path.exists():
        raise ImportError(f"bio_core.py not found at {bio_core_path}")
    
    spec = importlib.util.spec_from_file_location("bio_core_src", bio_core_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Failed to create module spec for {bio_core_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    logging.info("bio_core loaded from source successfully")
    return module


# Check if running in packaged app (PyInstaller)
is_packaged = hasattr(sys, '_MEIPASS')

# In packaged app, ALWAYS use source to ensure we have latest code with logging
if is_packaged:
    logging.info(f"Running in packaged app (_MEIPASS={sys._MEIPASS})")
    try:
        bio_core = load_source_bio_core()
    except ImportError as e:
        logging.error(f"Failed to load bio_core from source: {e}")
        logging.info("Falling back to compiled import")
        import bio_core  # type: ignore
else:
    # Development mode: try compiled first, then source
    use_source = os.environ.get("BIOVIZ_USE_SOURCE") in ("1", "true", "TRUE", "yes", "YES")

    try:
        if use_source:
            logging.info("Loading bio_core from source (BIOVIZ_USE_SOURCE set)")
            bio_core = load_source_bio_core()
        else:
            # Try importing as a compiled module first (so/pyd)
            logging.info("Trying to import compiled bio_core module")
            import bio_core  # type: ignore
            logging.info("Compiled bio_core imported successfully")
    except ImportError as e:
        logging.warning(f"Compiled import failed: {e}, falling back to source")
        # Fallback to source (useful for development)
        try:
            bio_core = load_source_bio_core()
        except ImportError as e2:
            logging.error(f"Failed to import bio_core: {e2}")
            print(f"Failed to import bio_core: {e2}", file=sys.stderr)
            sys.exit(1)

if __name__ == "__main__":
    try:
        logging.info("Starting main execution")
        if hasattr(bio_core, 'run'):
            logging.info("Calling bio_core.run()")
            bio_core.run()
        elif hasattr(bio_core, 'main'):
            logging.info("Calling bio_core.main()")
            bio_core.main()
        else:
            logging.error("bio_core module has no run() or main() function")
            print("bio_core module has no run() or main() function", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        logging.exception(f"Fatal error in main execution: {e}")
        print(f"Fatal error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        logging.info("=== BioViz Engine Exiting ===")

