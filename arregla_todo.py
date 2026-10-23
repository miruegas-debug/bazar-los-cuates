import pathlib, json, re
# 1. Asegurar public/data/banners.json con formato correcto
p_public = pathlib.Path("public/data/banners.json")
p_public.parent.mkdir(parents=True, exist_ok=True)

# formato que tu server.js entiende
banners = [
  {
    "id": "1",
    "titulo": "Anúnciate aquí - Tu negocio aquí $100 al mes",
    "link": "https://wa.me/524491883244?text=Hola quiero anunciarme en Bazar Los Cuates",
    "imagen": "",
    "activo": True
  },
  {
    "id": "2",
    "titulo": "Carpintería Los Cuates - Muebles rústicos",
    "link": "https://wa.me/524491883244",
    "imagen": "",
    "activo": True
  }
]

# si ya existe, respétalo pero conviértelo
if p_public.exists():
    try:
        old = json.loads(p_public.read_text())
        # convertir formato viejo a nuevo si hace falta
        new = []
        for b in old:
            if "titulo" in b:
                new.append(b)
            else:
                new.append({
                    "id": str(b.get("id","")),
                    "titulo": f"{b.get('texto','')} - {b.get('negocio','')}",
                    "link": f"https://wa.me/52{b.get('whatsapp','4491883244')}",
                    "imagen": "",
                    "activo": b.get("activo", True)
                })
        if new:
            banners = new
    except:
        pass

p_public.write_text(json.dumps(banners, indent=2, ensure_ascii=False))
print(f"OK public/data/banners.json con {len(banners)} banners")

# También copia a data/banners.json por si acaso
p_data = pathlib.Path("data/banners.json")
p_data.parent.mkdir(parents=True, exist_ok=True)
p_data.write_text(json.dumps(banners, indent=2, ensure_ascii=False))

# 2. Arregla index.html para que use /api/banners
idx = pathlib.Path("index.html")
html = idx.read_text()
# borra banner viejo
html = re.sub(r'<!-- BANNER ANUNCIATE AQUI - INICIO -->.*?<!-- BANNER ANUNCIATE AQUI - FIN -->', '', html, flags=re.DOTALL)

code = """
<!-- BANNER ANUNCIATE AQUI - INICIO -->
<div id="banner-anuncios" style="position:sticky;top:0;z-index:9999;background:black;color:white;text-align:center;padding:10px;font-weight:bold;cursor:pointer;display:none;">
  <span style="background:#facc15;color:black;padding:2px 6px;border-radius:4px;font-size:11px">ANUNCIO</span>
  <span id="banner-texto">Anúnciate aquí</span>
</div>
<script>
(async function(){
  try{
    const r = await fetch('/api/banners');
    let banners = await r.json();
    banners = banners.filter(b=>b.activo);
    if(banners.length==0) return;
    document.getElementById('banner-anuncios').style.display='block';
    let idx=0;
    const txt=document.getElementById('banner-texto');
    const ban=document.getElementById('banner-anuncios');
    function mostrar(){
      const b=banners[idx];
      txt.textContent='✨ '+b.titulo+' ✨';
      ban.onclick=function(){ if(b.link) window.open(b.link,'_blank'); };
    }
    mostrar();
    setInterval(function(){ idx=(idx+1)%banners.length; mostrar(); },3000);
  }catch(e){ console.log('no banners',e); }
})();
</script>
<!-- BANNER ANUNCIATE AQUI - FIN -->
"""
html = html.replace("<body>", "<body>\n"+code, 1)
idx.write_text(html)
print("OK index.html arreglado para usar /api/banners")
