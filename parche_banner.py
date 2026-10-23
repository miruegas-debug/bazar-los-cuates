import pathlib
p=pathlib.Path("index.html")
html=p.read_text()

# Código del banner que da vueltas
banner_code = """
<!-- BANNER ANUNCIATE AQUI - INICIO -->
<div id="banner-anuncios" style="position:sticky;top:0;z-index:9999;background:black;color:white;text-align:center;padding:8px;font-weight:bold;cursor:pointer;font-family:sans-serif">
  <span style="background:#facc15;color:black;padding:2px 6px;border-radius:4px;font-size:10px">ANUNCIO</span>
  <span id="banner-texto">✨ Anúnciate aquí ✨</span>
</div>
<script>
let banners = [];
let idx = 0;
fetch('/data/banners.json').then(r=>r.json()).then(d=>{ banners=d.filter(b=>b.activo); if(banners.length>0) mostrar(); }).catch(()=>{
  banners=[{texto:"Anúnciate aquí", negocio:"Tu negocio aquí - $100 al mes", whatsapp:"4491883244", activo:true}];
  mostrar();
});
function mostrar(){
  const b=banners[idx];
  document.getElementById('banner-texto').innerHTML = `✨ ${b.texto} - ${b.negocio} ✨`;
  document.getElementById('banner-anuncios').onclick = ()=>{
    window.open(`https://wa.me/52${b.whatsapp}?text=Hola vi tu anuncio de ${b.negocio} en Bazar Los Cuates`,'_blank');
  };
}
setInterval(()=>{
  if(banners.length<=1) return;
  idx=(idx+1)%banners.length;
  mostrar();
},3000);
</script>
<!-- BANNER ANUNCIATE AQUI - FIN -->
"""

if "banner-anuncios" not in html:
    # Lo pone justo después de <body>
    html = html.replace("<body>", "<body>\n"+banner_code, 1)
    p.write_text(html)
    print("OK BANNER PUESTO EN index.html")
else:
    print("Ya tiene banner")
