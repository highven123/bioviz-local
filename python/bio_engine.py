import os
import sys
import logging
from pathlib import Path
from datetime import datetime

# ==================================================================================
# CRITICAL FIX FOR PACKAGED APP IPC
# Force stdout/stderr to be unbuffered IMMEDIATELY before any imports/logging
# ==================================================================================
if sys.platform != 'win32':
    try:
        # STDIN MUST BE UNBUFFERED/LINE-BUFFERED TOO!
        sys.stdin.reconfigure(line_buffering=True)
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except AttributeError:
        pass # Python < 3.7

print(">>> [BioEngine] BOOTSTRAP VERIFICATION (FINAL 4 - DEBUG CMD) <<<", file=sys.stderr, flush=True)


# Force PyInstaller to include these for pkg_resources compatibility
try:
    import pkg_resources
    import jaraco.text
    import jaraco.functools
    import jaraco.context
except ImportError:
    pass

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


# Check if running in packaged app (PyInstaller)
is_packaged = hasattr(sys, '_MEIPASS')

try:
    # Direct import is the most reliable way for PyInstaller
    # It ensures we use the version bundled in the PYZ archive
    import bio_core
    logging.info("bio_core imported successfully")
except ImportError as e:
    logging.error(f"Failed to import bio_core: {e}")
    # Try adding current directory to path just in case
    sys.path.append(os.getcwd())
    try:
        import bio_core
        logging.info("bio_core imported successfully after path fix")
    except ImportError as e2:
        logging.error(f"FATAL: Failed to import bio_core even after path fix: {e2}")
        print(f"FATAL: Failed to import bio_core: {e2}", file=sys.stderr)
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
