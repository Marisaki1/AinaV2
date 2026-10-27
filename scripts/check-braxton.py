"""Compatibility entry point: the level-15 party checker supersedes the CR-3 proof.

Accepts an exports directory or its Braxton JSON, and an optional official source
directory (or the older initiative_effect_current.py path). Local tests only.
"""
import pathlib
import runpy
import sys

checker = pathlib.Path(__file__).with_name('check-level15-party.py')
directory = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else checker.parent.parent / 'exports'
if directory.is_file():
    directory = directory.parent
arguments = [str(checker), str(directory)]
if len(sys.argv) > 2:
    reference = pathlib.Path(sys.argv[2])
    arguments.append(str(reference.parent if reference.is_file() else reference))
sys.argv = arguments
runpy.run_path(str(checker), run_name='__main__')
