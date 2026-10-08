#!/usr/bin/env python3
"""Real installed-APK keyboard regression; taps only, never enters credentials.
Run with an evidence prefix. Fails if dragging hides IME or clips field/action.
"""
import importlib.util
import json
import re
import sys
import time

spec = importlib.util.spec_from_file_location('capture', __file__.replace('assert-native-keyboard.py', 'verify-native-keyboard.py'))
assert spec is not None and spec.loader is not None
cap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cap)
prefix = sys.argv[1]

def snapshot(label):
    name = f'{prefix}-{label}'
    cap.capture(name)
    return json.loads((cap.ROOT / f'{name}-nodes.json').read_text()), name

def bounds(node):
    return tuple(map(int, re.findall(r'\d+', node['bounds'])))

def tap(node):
    x1, y1, x2, y2 = bounds(node)
    assert x2 > x1 and y2 > y1, 'Cannot tap clipped node'
    cap.adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
    time.sleep(2)

cap.adb('shell', 'am', 'force-stop', 'es.nacho.menuenpareja')
cap.adb('shell', 'monkey', '-p', 'es.nacho.menuenpareja', '1')
time.sleep(4)
nodes, _ = snapshot('initial')
button = next(n for n in nodes if (n.get('text') or n.get('content-desc')) == 'Entrar' and n.get('class') != 'android.widget.TextView')
full_height = bounds(button)[3] - bounds(button)[1]
fields = [n for n in nodes if n['class'] == 'android.widget.EditText']
if '--direct-password' in sys.argv:
    tap(fields[1])
else:
    tap(fields[0])
    nodes, _ = snapshot('email')
    tap(next(n for n in nodes if n['class'] == 'android.widget.EditText' and n.get('password') == 'true'))
nodes, _ = snapshot('password-before-scroll')
cap.adb('shell', 'input', 'swipe', '900', '1400', '900', '850', '400')
time.sleep(2)
nodes, name = snapshot('password-after-scroll')
ime = (cap.ROOT / f'{name}-ime.txt').read_text()
windows = (cap.ROOT / f'{name}-windows.txt').read_text()
failures = []
if 'mInputShown=true' not in ime or 'mIsInputViewShown=true' not in ime:
    failures.append('Scrolling dismissed IME; form must scroll while keyboard stays open')
block = windows.split('u0 InputMethod}:', 1)[1].split('Window #', 1)[0]
match = re.search(r'touchable region=SkRegion\(\(\d+,(\d+),', block)
assert match, 'Missing IME touchable region'
top = int(match.group(1))
focused = [n for n in nodes if n['class'] == 'android.widget.EditText' and n.get('focused') == 'true']
if len(focused) != 1:
    failures.append('Password field lost focus while scrolling')
else:
    x1, y1, x2, y2 = bounds(focused[0])
    if not (0 <= y1 < y2 <= top):
        failures.append(f'Focused field not visible above IME: {focused[0]["bounds"]}, IME top={top}')
button = next(n for n in nodes if (n.get('text') or n.get('content-desc')) == 'Entrar' and n.get('class') != 'android.widget.TextView')
x1, y1, x2, y2 = bounds(button)
if not (0 <= y1 < y2 <= top and y2-y1 >= full_height):
    failures.append(f'Primary action clipped: {button["bounds"]}; expected height={full_height}, IME top={top}')
result = {'passed': not failures, 'failures': failures, 'ime_top': top, 'full_action_height': full_height, 'action_bounds': button['bounds'], 'focused_bounds': focused[0]['bounds'] if focused else None}
(cap.ROOT / f'{prefix}-assertion.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
assert not failures, '; '.join(failures)
