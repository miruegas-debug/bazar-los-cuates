import pathlib
p=pathlib.Path("server.js")
s=p.read_text()

# Si no existe el GET, agrégalo después del POST de banners
if "app.get('/api/banners'" not in s:
    s=s.replace(
        "app.post('/api/banners'",
        "app.get('/api/banners',(r,s)=>{try{s.json(readJson(bannerFile,[]))}catch(e){s.json([])}});\napp.post('/api/banners'"
    )
    print("AGREGADO GET /api/banners")
else:
    print("Ya existe GET")

# También asegúrate que bannerFile esté definido
if "bannerFile" not in s:
    s=s.replace("const dataDir=", "const bannerFile=path.join(__dirname,'public/data/banners.json');\nconst dataDir=")

p.write_text(s)
print("server.js arreglado")
