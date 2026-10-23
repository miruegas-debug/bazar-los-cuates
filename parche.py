import pathlib
p=pathlib.Path("app/layout.tsx")
t=p.read_text()
if "BannerAnuncios" not in t:
    if 'import "./globals.css";' in t:
        t=t.replace('import "./globals.css";', 'import "./globals.css";\nimport BannerAnuncios from "@/components/BannerAnuncios";')
    else:
        t='import BannerAnuncios from "@/components/BannerAnuncios";\n'+t
    t=t.replace("<body>", "<body>\n        <BannerAnuncios />", 1)
    p.write_text(t)
    print("OK parchado")
else:
    print("Ya tiene Banner")
