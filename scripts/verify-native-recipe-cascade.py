#!/usr/bin/env python3
"""Native recipe/shopping journeys in environment-only local preview; no passwords."""
import json, pathlib, subprocess, time, re, xml.etree.ElementTree as ET
ROOT = pathlib.Path(__file__).resolve().parents[1] / 'artifacts/recipe-sync/native-local-preview'
ROOT.mkdir(parents=True, exist_ok=True)
ADB = ['adb', '-s', 'emulator-5580']
REPORT = {'mode': 'Environment-only local preview; not authenticated cloud release evidence', 'checks': []}
def adb(*args):
    return subprocess.check_output(ADB + list(args), stderr=subprocess.STDOUT)
def nodes():
    adb('shell', 'uiautomator', 'dump', '/sdcard/recipe-shopping.xml')
    return [dict(n.attrib) for n in ET.fromstring(adb('shell', 'cat', '/sdcard/recipe-shopping.xml')).iter('node')]
def text():
    return ' | '.join(n.get('text', '') + ' ' + n.get('content-desc', '') for n in nodes())
def find(label):
    return next((n for n in nodes() if n.get('text') == label or n.get('content-desc') == label), None)
def require(label):
    n = find(label)
    assert n, label
    return n
def tap(n):
    x, y, z, w = map(int, re.findall(r'\d+', n['bounds']))
    assert z > x and w > y, n['bounds']
    adb('shell', 'input', 'tap', str((x + z)//2), str((y + w)//2))
def click(label):
    for _ in range(6):
        n = find(label)
        if n:
            tap(n)
            return
        adb('shell', 'input', 'swipe', '540', '1750', '540', '700', '350')
    raise AssertionError('Missing action ' + label)
def wait(label):
    for _ in range(12):
        if label in text():
            return
        time.sleep(.3)
    raise AssertionError('Missing state ' + label)
def fill(label, value):
    n = find(label)
    assert n, label
    tap(n)
    adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END')
    for _ in range(len(n.get('text', '')) + 2):
        adb('shell', 'input', 'keyevent', 'KEYCODE_DEL')
    adb('shell', 'input', 'text', value.replace(' ', '%s'))
def hide_ime():
    adb('shell', 'input', 'keyevent', '4')
    time.sleep(.25)
def capture(label):
    (ROOT/(label+'.png')).write_bytes(adb('exec-out', 'screencap', '-p'))
    nodes()
    (ROOT/(label+'.xml')).write_bytes(adb('shell', 'cat', '/sdcard/recipe-shopping.xml'))
    REPORT['checks'].append({'check': label, 'status': 'PASS'})
def relaunch():
    adb('shell', 'am', 'force-stop', 'es.nacho.menuenpareja')
    adb('shell', 'am', 'start', '-n', 'es.nacho.menuenpareja/.MainActivity')
    time.sleep(2)
try:
    import uuid
    name = 'NativeCascade' + uuid.uuid4().hex[:6]
    renamed = name + 'Edited'
    relaunch(); wait('Modo en este móvil'); click('Semana siguiente')
    click('Platos'); click('Añadir plato')
    fill('p. ej. Tortilla de patata', name); hide_ime()
    fill('Ingrediente 1', 'Arroz - 100 g'); hide_ime()
    click('Añadir ingrediente'); fill('Ingrediente 2', 'Cebolla'); hide_ime()
    click('Guardar plato'); wait('Plato guardado'); click('Semana')
    for _ in range(2):
        click('Añadir menú'); click(name); time.sleep(.4)
    click('Compra'); wait('200 g'); click('Arroz'); wait('1 de 2 comprados')
    click('Añadir artículo a la lista'); fill('p. ej. detergente', 'JabonCascade'); hide_ime(); click('Añadir a la compra'); wait('JabonCascade')
    capture('shopping-before-edit')
    click('Semana siguiente'); click('Semana'); click('Añadir menú'); click(name); time.sleep(.5)
    click('Platos'); click('Editar ' + name); wait('EDITAR RECETA')
    fill(name, renamed); hide_ime()
    fill('Ingrediente 1', 'Arroz - 250 g'); hide_ime()
    fill('Ingrediente 2', 'Tomate - 2 ud'); hide_ime()
    click('Guardar cambios'); wait('Editar ' + renamed)
    click('Compra'); wait('250 g'); wait('2 ud'); assert not find('Cebolla')
    capture('current-week-refresh-without-replanning')
    click('Semana anterior'); wait('500 g'); wait('4 ud'); wait('JabonCascade')
    assert require('Arroz')['checked'] == 'true'; assert not find('Cebolla')
    capture('other-week-refresh-checks-manual-preserved')
    click('Semana'); wait(renamed); assert name not in text().replace(renamed, '')
    capture('renamed-menu-preserved')
    relaunch(); click('Semana siguiente'); click('Compra'); wait('500 g'); wait('4 ud'); wait('JabonCascade')
    assert require('Arroz')['checked'] == 'true'
    capture('cascade-persists-after-relaunch')
except Exception as e:
    REPORT['error'] = str(e)
    (ROOT/'failure.png').write_bytes(adb('exec-out', 'screencap', '-p'))
    raise
finally:
    (ROOT/'result.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(REPORT, ensure_ascii=False))