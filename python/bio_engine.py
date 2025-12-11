
try:
    # Try importing as a compiled module first (so/pyd)
    import bio_core
except ImportError:
    # Fallback to source (useful for development)
    try:
        import bio_core
    except ImportError as e:
        import sys
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
