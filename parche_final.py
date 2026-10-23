import pathlib, re
p=pathlib.Path("index.html")
html=p.read_text()
html=re.sub(r'<!-- BANNER ANUNCIATE AQUI - INICIO -->.*?<!-- BANNER ANUNCIATE AQUI - FIN -->', '', html, flags=re.DOTALL)
code="""
<!-- BANNER ANUNCIATE AQUI - INICIO -->
<div id="banner-anuncios" style="position:sticky;top:0;z-index:9999;background:black;color:white;text-align:center;padding:10px;font-weight:bold;cursor:pointer;">
  <span style="background:#facc15;color:black;padding:2px 6px;border-radius:4px;font-size:11px">ANUNCIO</span>
  <span id="banner-texto">Anunciate aqui</span>
</div>
<script>
(async function(){
  let banners=[];
  try{
    let r=await fetch('data/banners.json');
    if(!r.ok) r=await fetch('public/data/banners.json');
    banners=await r.json();
  }catch(e){
    banners=[{texto:"Anunciate aqui", negocio:"Tu negocio aqui $100 al mes", whatsapp:"4491883244", activo:true}];
  }
  banners=banners.filter(b=>b.activo);
  let idx=0;
  const txt=document.getElementById('banner-texto');
  const ban=document.getElementById('banner-anuncios');
  function mostrar(){
    const b=banners[idx];
    txt.textContent='✨ '+b.texto+' - '+b.negocio+' ✨';
    ban.onclick=function(){ window.open('https://wa.me/52'+b.whatsapp+'?text=Hola vi tu anuncio '+b.negocio+' en Bazar Los Cuates','_blank'); };
  }
  mostrar();
  setInterval(function(){ idx=(idx+1)%banners.length; mostrar(); },3000);
})();
</script>
<!-- BANNER ANUNCIATE AQUI - FIN -->
"""
html=html.replace("<body>", "<body>\n"+code, 1)
p.write_text(html)
print("OK BANNER FINAL PUESTO")
