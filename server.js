const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json({limit:'100mb'}));
app.use(express.urlencoded({limit:'100mb',extended:true}));

let productosMem = [];
let bannersMem = [];

let Producto=null, Banner=null;
try{
  const mongoose = require('mongoose');
  const MONGO = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL || '';
  if(MONGO){
    mongoose.connect(MONGO).then(()=>console.log('Mongo OK')).catch(e=>console.log('Mongo fail',e.message));
    Producto = mongoose.model('Producto', new mongoose.Schema({nombre:String,precio:Number,desc:String,descripcion:String,fotos:[String],imagen:String,video:String,createdAt:{type:Date,default:Date.now}},{strict:false}));
    Banner = mongoose.model('Banner', new mongoose.Schema({titulo:String,link:String,imagen:String,createdAt:{type:Date,default:Date.now}},{strict:false}));
  } else console.log('SIN MONGO_URI - usando memoria');
}catch(e){ console.log('Sin mongoose, usando memoria', e.message); }

app.get('/api/productos', async (req,res)=>{
  try{
    if(Producto){ let d=await Producto.find().sort({createdAt:-1}); return res.json(d); }
    res.json(productosMem);
  }catch(e){ res.json(productosMem); }
});

app.post('/api/productos', async (req,res)=>{
  try{
    let data = {...req.body, _id: Date.now().toString(), id: Date.now().toString(), createdAt: new Date()};
    if(Producto){ let doc = await Producto.create(req.body); return res.json(doc); }
    productosMem.unshift(data);
    console.log('Producto guardado en memoria:', data.nombre);
    res.json(data);
  }catch(e){ console.log(e); res.status(500).json({error:e.message}); }
});

app.delete('/api/productos/:id', async (req,res)=>{
  try{
    if(Producto){ await Producto.findByIdAndDelete(req.params.id); }
    productosMem = productosMem.filter(p=>p._id!=req.params.id && p.id!=req.params.id);
    res.json({ok:true});
  }catch(e){ res.json({ok:true}); }
});

app.get('/api/banners', async (req,res)=>{
  try{
    if(Banner){ let d=await Banner.find().sort({createdAt:-1}); return res.json(d); }
    res.json(bannersMem);
  }catch(e){ res.json(bannersMem); }
});

app.post('/api/banners', async (req,res)=>{
  try{
    let data = {...req.body, _id: Date.now().toString(), id: Date.now().toString(), createdAt: new Date()};
    if(Banner){ let doc = await Banner.create(req.body); return res.json(doc); }
    bannersMem.unshift(data);
    res.json(data);
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.delete('/api/banners/:id', async (req,res)=>{
  try{
    if(Banner){ await Banner.findByIdAndDelete(req.params.id); }
    bannersMem = bannersMem.filter(b=>b._id!=req.params.id && b.id!=req.params.id);
    res.json({ok:true});
  }catch(e){ res.json({ok:true}); }
});

app.use(express.static(__dirname));
app.get('/admin.html',(req,res)=>res.sendFile(path.join(__dirname,'admin.html')));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT,()=>console.log('ON '+PORT+' mem:'+productosMem.length));
