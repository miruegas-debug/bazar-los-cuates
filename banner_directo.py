import pathlib, re, json
idx = pathlib.Path("index.html")
html = idx.read_text()

# Borra cualquier banner viejo
html = re.sub(r'<!-- BANNER ANUNCIATE AQUI - INICIO -->.*?<!-- BANNER ANUNCIATE AQUI - FIN -->', '', html, flags=re.DOTALL)

code = """
<!-- BANNER ANUNCIATE AQUI - INICIO -->
<style>
#banner-principal{position:sticky;top:0;z-index:9999;background:#000;color:#fff;text-align:center;padding:12px;font-family:Arial;font-weight:bold;cursor:pointer;border-bottom:3px solid #facc15}
#banner-principal b{background:#facc15;color:#000;padding:2px 6px;border-radius:4px;font-size:11px;margin-right:8px}
</style>
<div id="banner-principal" onclick="window.open('https://wa.me/524491883244?text=Hola quiero anunciarme en Bazar Los Cuates','_blank')">
  <b>ANUNCIO</b><span id="txt-banner">✨ Anúnciate aquí - Tu negocio aquí $100 al mes ✨</span>
</div>
<script>
const banners=[
  "✨ Anúnciate aquí - Tu negocio aquí $100 al mes ✨",
  "✨ Carpintería Los Cuates - Muebles rústicos en Jesús María ✨",
  "✨ ¿Vendes algo? Anúnciate por $100 al mes aquí ✨"
];
let i=0;
setInterval(()=>{
  i=(i+1)%banners.length;
  document.getElementById('txt-banner').textContent=banners[i];
},3000);
</script>
<!-- BANNER ANUNCIATE AQUI - FIN -->
"""
# ponlo justo después de <body>
if "<body>" in html:
    html = html.replace("<body>", "<body>\n"+code, 1)
else:
    html = code + html

idx.write_text(html)
print("OK BANNER DIRECTO EN INDEX.HTML - SIN API - LISTO")
