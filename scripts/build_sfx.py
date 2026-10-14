# Kenney CC0 원본 → 앞 무음 제거, 꼬리 페이드, 피크 정규화, ogg + m4a 변환 → public/sfx/
import subprocess, sys, os, re, json
SRC = sys.argv[1]; OUT = sys.argv[2]
I = SRC + '/impact-sounds/Audio/'; U = SRC + '/interface-sounds/Audio/'
MAP = {
  'hit_soft':    [I+f'impactPlate_light_00{i}.ogg' for i in (1,3,4)],
  'hit_hard':    [I+f'impactPlate_light_00{i}.ogg' for i in (0,2,3)],
  'hit_perfect': [I+f'impactPlate_light_00{i}.ogg' for i in (1,3)],
  'bounce_front':[I+f'impactPlate_light_00{i}.ogg' for i in (0,2)],
  'bounce_side': [I+f'impactPlate_light_00{i}.ogg' for i in (2,4)],
  'bounce_glass':[I+f'impactGlass_light_00{i}.ogg' for i in (0,1,2)],
  'bounce_floor':[I+f'impactWood_light_00{i}.ogg' for i in (0,1,2)],
  'tin':         [I+f'impactTin_medium_00{i}.ogg' for i in (0,1,2)],
  'step':        [I+f'footstep_wood_00{i}.ogg' for i in (0,1,2,3,4)],
  'ui_hover':    [U+'tick_001.ogg'],
  'ui_click':    [U+'click_002.ogg'],
  'ui_confirm':  [U+'confirmation_001.ogg'],
  'ui_back':     [U+'back_001.ogg'],
  'ui_pause':    [U+'toggle_001.ogg'],
}
os.makedirs(OUT, exist_ok=True)
manifest = {}; credits = []
def peak_db(path):
    r = subprocess.run(['ffmpeg','-v','info','-i',path,'-af','volumedetect','-f','null','-'], capture_output=True, text=True)
    m = re.search(r'max_volume: (-?[\d.]+) dB', r.stderr); return float(m.group(1)) if m else 0.0
for key, files in MAP.items():
    manifest[key] = []
    for n, src in enumerate(files):
        base = f'{key}_{n}'
        tmp = os.path.join(OUT, base + '_tmp.wav')
        # 앞 무음 제거(-50dB), 최대 1.2초, 끝 40ms 페이드, 모노 44.1k
        subprocess.run(['ffmpeg','-v','error','-y','-i',src,'-af',
            'silenceremove=start_periods=1:start_threshold=-50dB,atrim=0:1.2,afade=t=out:st=1.16:d=0.04,aformat=channel_layouts=mono',
            '-ar','44100',tmp], check=True)
        g = -1.0 - peak_db(tmp)  # 피크 -1dBFS로 정규화
        for ext, codec in (('ogg',['-c:a','libvorbis','-q:a','5']), ('m4a',['-c:a','aac','-b:a','128k'])):
            subprocess.run(['ffmpeg','-v','error','-y','-i',tmp,'-af',f'volume={g:.2f}dB',*codec, os.path.join(OUT, f'{base}.{ext}')], check=True)
        os.remove(tmp)
        manifest[key].append(base)
        credits.append((base, os.path.basename(src), 'impact-sounds' if '/impact-sounds/' in src else 'interface-sounds'))
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print(json.dumps({k: len(v) for k, v in manifest.items()}))
json.dump(credits, open(os.path.join(OUT, '_credits.json'), 'w'))
