/**
 * BioViz Local - Python Build Script (Extreme Slim Edition)
 * 
 * Goal: Build a Python binary UNDER 100MB
 * Strategy: Aggressive module exclusion via PyInstaller
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
const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

/**
 * Get the target triple from rustc
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
 * Get file extension based on platform
 */
function getExtension(targetTriple) {
    return targetTriple.includes('windows') ? '.exe' : '';
}

/**
 * Generate PyInstaller exclusion list
 * This is the CRITICAL part for size reduction
 */
function getExclusionList() {
    return [
        // === GUI Frameworks (Save ~30MB) ===
        'tkinter', '_tkinter', 'Tkinter',
        'PyQt5', 'PyQt6', 'PySide2', 'PySide6',
        'wx', 'wxPython',
        'curses',

        // === Testing & Dev Tools (Save ~10MB) ===
        'unittest', 'test', 'tests',
        'pytest', 'nose', 'doctest',
        'pdb', 'profile', 'pstats',
        'setuptools', 'pip',
        // NOTE: distutils removed - causes PyInstaller conflict in Python 3.12+
        // NOTE: pandas/numpy/scipy KEPT - required for gseapy

        // === Data Science - Only exclude unused packages ===
        'matplotlib', 'seaborn', 'plotly',
        'PIL', 'Pillow',
        'sklearn', 'scikit-learn',

        // === Web Frameworks (Save ~15MB) ===
        'flask', 'django', 'tornado',
        'aiohttp', 'fastapi', 'starlette',
        'werkzeug', 'jinja2',

        // === LangChain Bloat (Save ~20MB) ===
        'langchain', 'langsmith', 'langserve',
        'chromadb', 'faiss', 'pinecone',
        'huggingface_hub', 'transformers',

        // === Async/Concurrency (Keep minimal) ===
        'multiprocessing', 'concurrent.futures',

        // === Encodings (Keep only essentials) ===
        'encodings.bz2_codec',
        'encodings.zlib_codec',
        'encodings.hex_codec',
        'encodings.quopri_codec',
        'encodings.uu_codec',

        // === Misc Bloat ===
        'IPython', 'jupyter',
        'notebook', 'nbformat',
        'xml.dom', 'xml.sax',
        'html.parser',
        // NOTE: email and calendar KEPT - required by pkg_resources/setuptools
    ];
}

/**
 * Format size in MB
 */
function formatSize(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2);
}

/**
 * Rebuild the Cythonized core so PyInstaller never bundles a stale .so
 */
function rebuildCythonCore() {
    console.log('[build-python] Rebuilding bio_core (Cython) ...');
    try {
        execSync(`${PYTHON_CMD} setup.py build_ext --inplace`, {
            cwd: PYTHON_DIR,
            stdio: 'inherit',
        });
    } catch (error) {
        console.error('[build-python] Failed to rebuild bio_core:', error.message);
        process.exit(1);
    }
}

/**
 * Run PyInstaller with aggressive exclusions
 */
function buildPython() {
    console.log('[build-python] Building Python engine with PyInstaller...');
    console.log('[build-python] 🔥 EXTREME SLIM MODE: Excluding unused modules');

    if (!fs.existsSync(PYTHON_ENTRY)) {
        console.error(`[build-python] Python entry point not found: ${PYTHON_ENTRY}`);
        process.exit(1);
    }

    try {
        const sep = process.platform === 'win32' ? ';' : ':';
        const sourcePath = path.join(ROOT_DIR, 'assets', 'templates');
        const destPath = path.join('assets', 'templates');
        const addDataArg = `--add-data "${sourcePath}${sep}${destPath}"`;

        // Build exclusion arguments
        const exclusions = getExclusionList();
        const excludeArgs = exclusions.map(mod => `--exclude-module ${mod}`).join(' ');

        // Hidden imports needed for pkg_resources/setuptools vendored packages
        const hiddenImports = [
            'setuptools', 'pkg_resources',
            'jaraco.text', 'jaraco.functools', 'jaraco.context',
            'platformdirs', 'tomli', 'email', 'calendar',
            'secrets', 'gseapy', 'scipy', 'pandas', 'numpy'
        ];
        const hiddenImportArgs = hiddenImports.map(mod => `--hidden-import ${mod}`).join(' ');

        console.log(`[build-python] Excluding ${exclusions.length} modules...`);
        console.log(`[build-python] Adding ${hiddenImports.length} hidden imports...`);

        const pyinstallerCmd = [
            'pyinstaller',
            '--onefile',
            '--clean',
            '--strip',  // Strip debug symbols (Unix only, ignored on Windows)
            '--collect-all jaraco.text',
            '--collect-all jaraco.functools',
            '--collect-all jaraco.context',
            '--collect-all setuptools',
            '--collect-all scipy',
            '--collect-all pandas',
            '--collect-all numpy',
            '--collect-all gseapy',
            addDataArg,
            excludeArgs,
            hiddenImportArgs,
            '--name bio-engine',
            `--distpath "${PYTHON_DIR}/dist"`,
            `"${PYTHON_ENTRY}"`
        ].join(' ');

        execSync(pyinstallerCmd, {
            cwd: PYTHON_DIR,
            stdio: 'inherit',
        });

        console.log('[build-python] PyInstaller build complete');
    } catch (error) {
        console.error('[build-python] PyInstaller failed:', error.message);
        process.exit(1);
    }
}

/**
 * Move, rename, and report binary size
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

    // Get file size BEFORE moving
    const stats = fs.statSync(sourcePath);
    const sizeMB = formatSize(stats.size);

    // Copy the file
    fs.copyFileSync(sourcePath, targetPath);

    // Make executable on Unix
    if (!targetTriple.includes('windows')) {
        fs.chmodSync(targetPath, 0o755);
    }

    console.log(`[build-python] Binary ready at: ${targetPath}`);
    console.log('');
    console.log('='.repeat(60));
    console.log(`📦 FINAL BINARY SIZE: ${sizeMB} MB`);
    console.log('='.repeat(60));

    // Report success/failure
    if (parseFloat(sizeMB) < 60) {
        console.log('✅ PERFECT! Binary is under 60MB (神级优化)');
    } else if (parseFloat(sizeMB) < 200) {
        console.log('✅ EXCELLENT! Binary is under 200MB (完全可接受)');
    } else {
        console.log('❌ FAILED! Binary is over 200MB');
        console.log('   Check if pandas/numpy were accidentally installed');
        process.exit(1);
    }
}

/**
 * Clean up build artifacts
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
    console.log('[build-python] BioViz Python Sidecar Build (EXTREME SLIM)');
    console.log('='.repeat(60));

    const targetTriple = getTargetTriple();
    rebuildCythonCore(); // Ensure bio_core.cpython-*.so matches latest source
    buildPython();
    moveAndRenameBinary(targetTriple);
    cleanup();

    console.log('='.repeat(60));
    console.log('[build-python] Build complete!');
    console.log('='.repeat(60));
}

main();
