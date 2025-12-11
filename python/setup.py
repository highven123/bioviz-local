
from setuptools import setup
from Cython.Build import cythonize
import os

# Ensure we are in the correct directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

setup(
    ext_modules=cythonize(
        "bio_core.py",
        compiler_directives={'language_level': "3"},
        build_dir="build"
    ),
    zip_safe=False,
)
