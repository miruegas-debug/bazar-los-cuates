const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json({limit:'50mb'}));
app.use(express.urlencoded({limit:'50mb',extended:true}));

const MONGO = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost/bazar';
mongoose.connect(MONGO).then(()=>console.log('Mongo ok')).catch(e=>console.log('Mongo error',e.message));

const Producto = mongoose.model('Producto', new mongoose.Schema({
  nombre:String, precio:Number, desc:String, descripcion:String, fotos:[String], imagen:String, video:String, createdAt:{type:Date,default:Date.now}
},{strict:false}));

const Banner = mongoose.model('Banner', new mongoose.Schema({
  titulo:String, link:String, imagen:String, createdAt:{type:Date,default:Date.now}
},{strict:false}));

// APIs
app.get('/api/productos', async (req,res)=>{try{let p=await Producto.find().sort({createdAt:-1});res.json(p)}catch(e){res.status(500).json([])}});
app.post('/api/productos', async (req,res)=>{try{let n=await Producto.create(req.body);res.json(n)}catch(e){res.status(500).json({error:e.message})}});
app.delete('/api/productos/:id', async (req,res)=>{try{await Producto.findByIdAndDelete(req.params.id);res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});

app.get('/api/banners', async (req,res)=>{try{let b=await Banner.find().sort({createdAt:-1});res.json(b)}catch(e){res.status(500).json([])}});
app.post('/api/banners', async (req,res)=>{try{let n=await Banner.create(req.body);res.json(n)}catch(e){res.status(500).json({error:e.message})}});
app.delete('/api/banners/:id', async (req,res)=>{try{await Banner.findByIdAndDelete(req.params.id);res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});

// SERVIR ARCHIVOS ESTATICOS SIN VALIDAR - FIX DEFINITIVO
app.use(express.static(__dirname, {extensions:['html']}));

app.get('*', (req,res)=>{
  let file = req.path === '/' ? '/index.html' : req.path;
  let full = path.join(__dirname, file);
  // Si pide admin.html, siempre servirlo directo
  if(file.includes('admin')) return res.sendFile(path.join(__dirname,'admin.html'));
  res.sendFile(full, (err)=>{
    if(err) res.status(404).send('Archivo no encontrado: '+file);
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log('Server en '+PORT));
