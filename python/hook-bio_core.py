"""
PyInstaller hook for BioViz custom modules.
Ensures agent_runtime, motia, workflow_registry, narrative, and singlecell are bundled.
"""

from PyInstaller.utils.hooks import collect_all

# Collect all custom modules
datas, binaries, hiddenimports = collect_all('agent_runtime', include_py_files=True)
datas2, binaries2, hiddenimports2 = collect_all('motia', include_py_files=True)
datas3, binaries3, hiddenimports3 = collect_all('workflow_registry', include_py_files=True)

# Merge
datas += datas2 + datas3
binaries += binaries2 + binaries3
hiddenimports += hiddenimports2 + hiddenimports3

# Add narrative package
hiddenimports += [
    'narrative',
    'narrative.deduplication',
    'narrative.literature_rag',
]

# Add singlecell package (Phase 3)
hiddenimports += [
    'singlecell',
    'singlecell.sc_loader',
    'singlecell.pathway_scorer',
    'singlecell.spatial_lr',
    'singlecell.trajectory',
]
