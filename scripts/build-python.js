/**
 * BioViz Local - Python Build Script
 * 
 * This script:
 * 1. Detects the current target triple from `rustc -vV`
 * 2. Runs PyInstaller to package the Python engine
 * 3. Moves and renames the binary to match Tauri's sidecar naming convention
 * 
 * Usage: node scripts/build-python.js
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const ROOT_DIR = path.resolve(__dirname, '..');
const PYTHON_DIR = path.join(ROOT_DIR, 'python');
const BINARIES_DIR = path.join(ROOT_DIR, 'src-tauri', 'binaries');
const PYTHON_ENTRY = path.join(PYTHON_DIR, 'bio_engine.py');

/**
 * Get the target triple from rustc
 * e.g., "x86_64-apple-darwin", "x86_64-pc-windows-msvc"
 */
function getTargetTriple() {
    try {
        const rustcOutput = execSync('rustc -vV', { encoding: 'utf-8' });
        const hostLine = rustcOutput.split('\n').find(line => line.startsWith('host:'));

        if (!hostLine) {
            throw new Error('Could not find host line in rustc output');
        }

        const triple = hostLine.replace('host:', '').trim();
        console.log(`[build-python] Detected target triple: ${triple}`);
        return triple;
    } catch (error) {
        console.error('[build-python] Failed to get target triple:', error.message);
        console.error('[build-python] Make sure Rust is installed and rustc is in PATH');
        process.exit(1);
    }
}

/**
 * Determine the correct file extension based on the target triple
 */
function getExtension(targetTriple) {
    if (targetTriple.includes('windows')) {
        return '.exe';
    }
    return '';
}


/**
 * Compile bio_core.py using Cython
 */
function buildCython() {
    console.log('[build-python] Compiling core logic with Cython...');

    // Install Cython if needed (best effort)
    try {
        // Just checking version to see if installed
        execSync('cython --version', { stdio: 'ignore' });
    } catch (e) {
        console.log('[build-python] Cython not found, skipping compilation (using source fallback)');
        return false;
    }

    try {
        // Run setup.py build_ext --inplace
        // This compiles bio_core.py -> bio_core.c -> bio_core.so (or .pyd)
        execSync('python3 setup.py build_ext --inplace', {
            cwd: PYTHON_DIR,
            stdio: 'inherit'
        });
        console.log('[build-python] Cython compilation complete');
        return true;
    } catch (error) {
        console.error('[build-python] Cython compilation failed:', error.message);
        console.error('[build-python] Falling back to Python source interpretation');
        return false;
    }
}

/**
 * Run PyInstaller to build the Python engine
 */
function buildPython() {
    // 1. Try to compile with Cython first
    buildCython();

    console.log('[build-python] Building Python engine with PyInstaller...');

    // Check if bio_engine.py exists
    if (!fs.existsSync(PYTHON_ENTRY)) {
        console.error(`[build-python] Python entry point not found: ${PYTHON_ENTRY}`);
        process.exit(1);
    }

    // Run PyInstaller
    // Important: --hidden-import is often needed for dynamic imports, but here bio_core is imported directly
    // PyInstaller should automatically pick up the .so/.pyd file if it exists next to the script
    try {
        execSync(
            `pyinstaller --onefile --name bio-engine --distpath "${PYTHON_DIR}/dist" "${PYTHON_ENTRY}"`,
            {
                cwd: PYTHON_DIR,
                stdio: 'inherit',
            }
        );
        console.log('[build-python] PyInstaller build complete');
    } catch (error) {
        console.error('[build-python] PyInstaller failed:', error.message);
        process.exit(1);
    }
}

/**
 * Move and rename the binary to Tauri's expected location
 */
function moveAndRenameBinary(targetTriple) {
    const extension = getExtension(targetTriple);
    const sourceName = `bio-engine${extension}`;
    const targetName = `bio-engine-${targetTriple}${extension}`;

    const sourcePath = path.join(PYTHON_DIR, 'dist', sourceName);
    const targetPath = path.join(BINARIES_DIR, targetName);

    console.log(`[build-python] Moving binary: ${sourceName} -> ${targetName}`);

    // Ensure binaries directory exists
    if (!fs.existsSync(BINARIES_DIR)) {
        fs.mkdirSync(BINARIES_DIR, { recursive: true });
    }

    // Check if source exists
    if (!fs.existsSync(sourcePath)) {
        console.error(`[build-python] Source binary not found: ${sourcePath}`);
        process.exit(1);
    }

    // Copy the file (use copy instead of move for cross-device compatibility)
    fs.copyFileSync(sourcePath, targetPath);

    // Make it executable on Unix-like systems
    if (!targetTriple.includes('windows')) {
        fs.chmodSync(targetPath, 0o755);
    }

    console.log(`[build-python] Binary ready at: ${targetPath}`);
}

/**
 * Clean up PyInstaller artifacts
 */
function cleanup() {
    console.log('[build-python] Cleaning up build artifacts...');

    const artifactsToRemove = [
        path.join(PYTHON_DIR, 'build'),
        path.join(PYTHON_DIR, 'dist'),
        path.join(PYTHON_DIR, 'bio-engine.spec'),
    ];

    for (const artifact of artifactsToRemove) {
        if (fs.existsSync(artifact)) {
            if (fs.statSync(artifact).isDirectory()) {
                fs.rmSync(artifact, { recursive: true, force: true });
            } else {
                fs.unlinkSync(artifact);
            }
        }
    }

    console.log('[build-python] Cleanup complete');
}

// Main execution
function main() {
    console.log('='.repeat(60));
    console.log('[build-python] BioViz Python Sidecar Build Script');
    console.log('='.repeat(60));

    // Step 1: Get target triple
    const targetTriple = getTargetTriple();

    // Step 2: Build with PyInstaller
    buildPython();

    // Step 3: Move and rename
    moveAndRenameBinary(targetTriple);

    // Step 4: Cleanup (optional, comment out to keep artifacts)
    cleanup();

    console.log('='.repeat(60));
    console.log('[build-python] Build complete!');
    console.log('='.repeat(60));
}

main();
