const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 10000;
function serveFile(res, fp, type){ fs.readFile(fp, (e,d)=>{ if(e){res.writeHead(404);res.end('Not found');return;} res.writeHead(200,{'Content-Type':type}); res.end(d); }); }
const server = http.createServer((req,res)=>{
  let url=req.url.split('?')[0];
  console.log('Peticion:',url);
  if(url==='/'||url==='/index.html') return serveFile(res, path.join(__dirname,'index.html'), 'text/html');
  if(url==='/admin'||url==='/admin.html') return serveFile(res, path.join(__dirname,'admin.html'), 'text/html');
  if(url==='/admin.js') return serveFile(res, path.join(__dirname,'admin.js'), 'application/javascript');
  let fp=path.join(__dirname,url);
  if(fs.existsSync(fp)&&fs.statSync(fp).isFile()) return serveFile(res,fp,'text/html');
  fp=path.join(__dirname,'public',url);
  if(fs.existsSync(fp)&&fs.statSync(fp).isFile()) return serveFile(res,fp,'text/html');
  res.writeHead(404); res.end('Cannot GET '+url);
});
server.listen(PORT,'0.0.0.0',()=>{console.log('ON '+PORT+' - EL CHIDO 2ded6a1');});
