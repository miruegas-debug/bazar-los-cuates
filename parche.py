import pathlib, os
base = pathlib.Path.home() / "bazar-los-cuates"
os.chdir(base)
print(f"En {base}")
os.makedirs("public/data", exist_ok=True)
os.makedirs("public/uploads", exist_ok=True)
server_js = """
const express=require('express');const multer=require('multer');const fs=require('fs');const path=require('path');const app=express();
app.use(express.json({limit:'50mb'}));app.use(express.static(__dirname));app.use('/public',express.static(path.join(__dirname,'public')));
const uploadDir=path.join(__dirname,'public/uploads');if(!fs.existsSync(uploadDir))fs.mkdirSync(uploadDir,{recursive:true});
const dataDir=path.join(__dirname,'public/data');if(!fs.existsSync(dataDir))fs.mkdirSync(dataDir,{recursive:true});
const storage=multer.diskStorage({destination:(r,f,cb)=>cb(null,uploadDir),filename:(r,f,cb)=>cb(null,Date.now()+'-'+f.originalname.replace(/\\s/g,'-'))});
const upload=multer({storage});
function readJson(p,d){try{if(!fs.existsSync(p))return d;return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return d;}}
function writeJson(p,d){fs.writeFileSync(p,JSON.stringify(d,null,2));}
const bannerFile=path.join(dataDir,'banners.json');
app.get('/api/banners',(r,s)=>s.json(readJson(bannerFile,[])));
app.post('/api/banners',upload.single('imagen'),(r,s)=>{const b=readJson(bannerFile,[]);const n={id:Date.now().toString(),titulo:r.body.titulo||'Banner',link:r.body.link||'',imagen:r.file?'/public/uploads/'+r.file.filename:r.body.imagen_url||'',activo:true};b.unshift(n);writeJson(bannerFile,b);s.json(n);});
app.delete('/api/banners/:id',(r,s)=>{let b=readJson(bannerFile,[]);b=b.filter(x=>x.id!==r.params.id);writeJson(bannerFile,b);s.json({ok:true});});
const prodFile=path.join(dataDir,'productos.json');
app.get('/api/productos',(r,s)=>s.json(readJson(prodFile,[])));
app.post('/api/productos',upload.fields([{name:'fotos',maxCount:10},{name:'video',maxCount:1}]),(r,s)=>{const p=readJson(prodFile,[]);const fotos=(r.files['fotos']||[]).map(f=>'/public/uploads/'+f.filename);const video=r.files['video']?'/public/uploads/'+r.files['video'][0].filename:'';const n={id:Date.now().toString(),nombre:r.body.nombre,precio:r.body.precio,desc:r.body.desc,whatsapp:r.body.whatsapp||'4491883244',fotos,video,fecha:new Date().toISOString()};p.unshift(n);writeJson(prodFile,p);s.json(n);});
app.listen(process.env.PORT||3000,()=>console.log('Bazar en 3000'));
"""
open('server.js','w',encoding='utf-8').write(server_js)
print('server.js listo - banner + N fotos')
idx_path=base/'index.html'
if idx_path.exists():
    idx=idx_path.read_text(encoding='utf-8',errors='ignore')
    idx=idx.replace('4490000000','4491883244').replace('524490000000','524491883244')
    if 'banner-inteligente' not in idx:
        banner='''<!-- BANNER -->
<div id="banner-inteligente" style="width:100%;background:#f5f5f5;"><div id="banner-container" style="width:100%;"></div></div>
<script>async function cargarBanners(){try{const r=await fetch('/public/data/banners.json');const b=await r.json();const c=document.getElementById('banner-container');if(!b.length){c.innerHTML='<div style="padding:20px;text-align:center;background:linear-gradient(90deg,#ff8a00,#e52e71);color:white;font-weight:bold;">📢 ANUNCIATE AQUI - Bazar Los Cuates - Constitucion 216 - WhatsApp 4491883244</div>';return;}c.innerHTML=b.map(x=>`<a href="${x.link||'#'}"><img src="${x.imagen}" style="width:100%;max-height:280px;object-fit:cover;width:100%"></a>`).join('');}catch(e){document.getElementById('banner-container').innerHTML='<div style="padding:20px;text-align:center;background:#000;color:#fff;">📢 ANUNCIATE AQUI 4491883244</div>';}}cargarBanners();</script>'''
        idx=idx.replace('<body>','<body>\\n'+banner)
    open(idx_path,'w',encoding='utf-8').write(idx)
    print('index.html con 4491883244')
admin='''<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Admin Bazar</title><style>body{font-family:Arial;padding:15px;background:#f9f9f9}.card{background:#fff;padding:15px;border-radius:10px;margin-bottom:15px}input,textarea{width:100%;padding:10px;margin:5px 0}button{background:#e52e71;color:#fff;padding:10px;border:none;border-radius:5px}</style></head><body><h1>Admin Bazar - EL BUENO</h1><div class="card"><h2>Banner Inteligente</h2><input id="b_titulo" placeholder="Titulo"><input id="b_link" placeholder="Link"><input type="file" id="b_imagen"><button onclick="subirBanner()">Subir Banner</button><div id="lista-banners"></div></div><div class="card"><h2>Producto N Fotos + Video</h2><input id="p_nombre" placeholder="Nombre"><input id="p_precio" placeholder="Precio"><textarea id="p_desc" placeholder="Desc"></textarea><input id="p_whats" value="4491883244"><label>Fotos hasta 10:</label><input type="file" id="p_fotos" multiple accept="image/*"><label>Video:</label><input type="file" id="p_video" accept="video/*"><button onclick="subirProducto()">Subir Producto</button><div id="msg"></div></div><script>async function cargarBanners(){const r=await fetch('/api/banners');const d=await r.json();document.getElementById('lista-banners').innerHTML=d.map(b=>`<div><img src="${b.imagen}" style="width:100px;height:60px;object-fit:cover"> ${b.titulo} <button onclick="borrarBanner('${b.id}')">Borrar</button></div>`).join('');}async function subirBanner(){const fd=new FormData();fd.append('titulo',document.getElementById('b_titulo').value);fd.append('link',document.getElementById('b_link').value);const f=document.getElementById('b_imagen').files[0];if(f)fd.append('imagen',f);await fetch('/api/banners',{method:'POST',body:fd});alert('Banner ok');cargarBanners();}async function borrarBanner(id){await fetch('/api/banners/'+id,{method:'DELETE'});cargarBanners();}async function subirProducto(){const fd=new FormData();fd.append('nombre',document.getElementById('p_nombre').value);fd.append('precio',document.getElementById('p_precio').value);fd.append('desc',document.getElementById('p_desc').value);fd.append('whatsapp',document.getElementById('p_whats').value);const fotos=document.getElementById('p_fotos').files;for(let i=0;i<fotos.length;i++)fd.append('fotos',fotos[i]);const vid=document.getElementById('p_video').files[0];if(vid)fd.append('video',vid);document.getElementById('msg').innerText='Subiendo...';await fetch('/api/productos',{method:'POST',body:fd});document.getElementById('msg').innerText='Producto subido';}cargarBanners();</script></body></html>'''
open('admin.html','w',encoding='utf-8').write(admin)
print('admin.html EL BUENO creado')
for jf in ['public/data/banners.json','public/data/productos.json']:
    p=base/jf
    if not p.exists(): p.write_text('[]',encoding='utf-8')
print('LISTO - EL BUENO PUESTO')
