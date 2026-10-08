#!/usr/bin/env python3
"""Exercise the release APK with generated disposable credentials from stdin only."""
import json, pathlib, subprocess, sys, time, re, xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]/'artifacts/android/account-native'
ROOT.mkdir(parents=True,exist_ok=True)
CFG=json.load(sys.stdin)
ADB=['adb','-s','emulator-5580']
REPORT=[]
def adb(*args): return subprocess.check_output(ADB+list(args),stderr=subprocess.STDOUT)
def nodes():
    adb('shell','uiautomator','dump','/sdcard/account-verify.xml')
    return [dict(n.attrib) for n in ET.fromstring(adb('shell','cat','/sdcard/account-verify.xml')).iter('node')]
def texts(): return ' | '.join(n.get('text','')+' '+n.get('content-desc','') for n in nodes())
def tap(n):
    x,y,z,w=map(int,re.findall(r'\d+',n['bounds']));adb('shell','input','tap',str((x+z)//2),str((y+w)//2))
def click(label):
    for _ in range(7):
        n=next((n for n in nodes() if n.get('text')==label or n.get('content-desc')==label),None)
        if n: tap(n);return
        adb('shell','input','swipe','540','1300','540','600','400');time.sleep(.3)
    raise AssertionError('Missing action '+label)
def wait(label):
    for _ in range(20):
        if label in texts(): return
        time.sleep(.5)
    raise AssertionError('Missing state '+label)
def capture(label):
    (ROOT/(label+'.png')).write_bytes(adb('exec-out','screencap','-p'))
    ns=nodes();(ROOT/(label+'.json')).write_text(json.dumps(ns,ensure_ascii=False,indent=2))
    (ROOT/(label+'.xml')).write_bytes(adb('shell','cat','/sdcard/account-verify.xml'))
    REPORT.append({'check':label,'status':'PASS'})
def relaunch():
    adb('shell','am','force-stop','es.nacho.menuenpareja');adb('shell','am','start','-n','es.nacho.menuenpareja/.MainActivity');time.sleep(2)
def fill(n,text):
    tap(n);adb('shell','input','keyevent','KEYCODE_MOVE_END')
    for _ in range(len(n.get('text',''))+3): adb('shell','input','keyevent','KEYCODE_DEL')
    adb('shell','input','text',text)
def login(who):
    wait('Inicia sesión')
    ns=[n for n in nodes() if n.get('class')=='android.widget.EditText']; fill(ns[0],CFG[who]['email'])
    ns=[n for n in nodes() if n.get('class')=='android.widget.EditText']; fill(ns[-1],CFG[who]['password'])
    adb('shell','input','keyevent','4');click('Entrar');wait('Con quién compartes')
def create_house(name):
    ns=[n for n in nodes() if n.get('class')=='android.widget.EditText'];fill(ns[0],name)
    adb('shell','input','keyevent','4');click('Crear casa compartida');wait(name+' · sincronizado')
def logout(label):
    click('Mi cuenta');wait('CORREO ELECTRÓNICO');capture(label+'-panel');click('Cerrar sesión');wait('Inicia sesión');capture(label+'-login');relaunch();wait('Inicia sesión');capture(label+'-relaunch')
try:
    relaunch();login('a');create_house(CFG['a']['house']);capture('a-header')
    click('Crear primer plato');wait('NOMBRE DEL PLATO');ns=[n for n in nodes() if n.get('class')=='android.widget.EditText'];fill(ns[0],CFG['marker'])
    adb('shell','input','keyevent','4');click('Guardar plato');time.sleep(2)
    relaunch();wait(CFG['a']['house']+' · sincronizado');capture('a-auto-login')
    click('Compartir código de casa');wait('Únete a');capture('native-share-invitation');adb('shell','input','keyevent','4');time.sleep(.5)
    logout('a-logout')
    login('b');create_house(CFG['b']['house']);assert CFG['marker'] not in texts();capture('b-private-house');logout('b-logout')
    # Return to A: remote data must remain intact after logout and switching.
    wait('Inicia sesión');ns=[n for n in nodes() if n.get('class')=='android.widget.EditText'];fill(ns[0],CFG['a']['email'])
    ns=[n for n in nodes() if n.get('class')=='android.widget.EditText'];fill(ns[-1],CFG['a']['password']);adb('shell','input','keyevent','4');click('Entrar');wait(CFG['a']['house']+' · sincronizado')
    click('Platos');wait(CFG['marker']);capture('a-shared-data-preserved');logout('final-logout')
except Exception as e:
    REPORT.append({'check':'native-execution','status':'FAIL','error':str(e)});capture('failure');raise
finally:
    (ROOT/'result.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(REPORT,ensure_ascii=False))
