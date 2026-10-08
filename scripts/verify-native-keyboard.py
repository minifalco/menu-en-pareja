#!/usr/bin/env python3
"""Capture actual emulator UI/IME evidence, never enter passwords."""
import subprocess, pathlib, sys, json, re, xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]/'artifacts/android/native-keyboard'
ROOT.mkdir(parents=True,exist_ok=True)
ADB=['adb','-s','emulator-5580']
def adb(*args):
    return subprocess.check_output(ADB+list(args))
def capture(name):
    (ROOT/f'{name}.png').write_bytes(adb('exec-out','screencap','-p'))
    adb('shell','uiautomator','dump','/sdcard/native-verify.xml')
    xml=adb('shell','cat','/sdcard/native-verify.xml')
    (ROOT/f'{name}.xml').write_bytes(xml)
    windows=adb('shell','dumpsys','window','windows').decode()
    ime=adb('shell','dumpsys','input_method').decode()
    (ROOT/f'{name}-windows.txt').write_text(windows)
    (ROOT/f'{name}-ime.txt').write_text(ime)
    nodes=[dict(n.attrib) for n in ET.fromstring(xml).iter('node')]
    selected=[n for n in nodes if n.get('text') or n.get('content-desc') or n.get('focused')=='true' or n.get('class')=='android.widget.EditText']
    (ROOT/f'{name}-nodes.json').write_text(json.dumps(selected,ensure_ascii=False,indent=2))
    for n in selected:
        print(n.get('text') or n.get('content-desc') or n.get('class'),n.get('bounds'),'focused='+n.get('focused',''))
    print('IME',*[x.strip() for x in ime.splitlines() if 'mInputShown' in x or 'mIsInputViewShown' in x])
if __name__=='__main__':capture(sys.argv[1])
