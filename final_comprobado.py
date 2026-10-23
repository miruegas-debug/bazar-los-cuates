import pathlib, re
code = """\n<!-- BANNER PRINCIPAL REAL - INICIO -->\n<div id="banner-real" style="position:fixed;top:0;left:0;right:0;z-index:99999;background:#000;color:#fff;text-align:center;padding:14px 10px;font-family:Arial, sans-serif;font-weight:900;font-size:16px;border-bottom:4px solid #facc15;cursor:pointer" onclick="window.open('https://wa.me/524491883244?text=Hola quiero anunciarme en Bazar Los Cuates','_blank')">\n<span style="background:#facc15;color:#000;padding:3px 8px;border-radius:4px;margin-right:8px">ANUNCIO</span>\n<span id="txt-banner-real">ANUNCIATE AQUI - $100 AL MES</span>\n</div>\n<div style="height:52px"></div>\n<script>\nconst bannersReal=["ANUNCIATE AQUI - Tu negocio aqui $100 al mes","Carpinteria Los Cuates - Muebles rusticos","Vendes algo? Anunciate aqui por $100"];let ir=0;setInterval(()=>{ir=(ir+1)%bannersReal.length;const el=document.getElementById('txt-banner-real');if(el)el.textContent="✨ "+bannersReal[ir]+" ✨";},2500);\n</script>\n<!-- BANNER PRINCIPAL REAL - FIN -->\n"""
for f in ["index.html","public/index.html"]:
  p=pathlib.Path(f)
  if not p.exists(): 
    print(f"NO EXISTE {f}")
    continue
  h=p.read_text()
  h=re.sub(r'<!-- BANNER PRINCIPAL REAL - INICIO -->.*?<!-- BANNER PRINCIPAL REAL - FIN -->', '', h, flags=re.DOTALL)
  h=re.sub(r'<!-- BANNER ANUNCIATE AQUI - INICIO -->.*?<!-- BANNER ANUNCIATE AQUI - FIN -->', '', h, flags=re.DOTALL)
  if "<body>" in h:
    h=h.replace("<body>","<body>"+code,1)
  else:
    h=code+h
  p.write_text(h)
  print(f"OK BANNER PUESTO EN {f}")

# COMPROBACION REAL QUE NO ME BRINCO NADA
import subprocess, json
for f in ["index.html","public/index.html"]:
  print(f"\n--- Comprobando {f} ---")
  subprocess.run(["grep","-n","banner-real",f])
