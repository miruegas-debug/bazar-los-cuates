
const express=require('express');const multer=require('multer');const fs=require('fs');const path=require('path');const app=express();
app.use(express.json({limit:'50mb'}));app.use(express.static(__dirname));app.use('/public',express.static(path.join(__dirname,'public')));
const uploadDir=path.join(__dirname,'public/uploads');if(!fs.existsSync(uploadDir))fs.mkdirSync(uploadDir,{recursive:true});
const dataDir=path.join(__dirname,'public/data');if(!fs.existsSync(dataDir))fs.mkdirSync(dataDir,{recursive:true});
const storage=multer.diskStorage({destination:(r,f,cb)=>cb(null,uploadDir),filename:(r,f,cb)=>cb(null,Date.now()+'-'+f.originalname.replace(/\s/g,'-'))});
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
