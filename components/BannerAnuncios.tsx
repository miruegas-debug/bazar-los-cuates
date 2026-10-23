"use client";
import { useState, useEffect } from "react";

type Banner = { id: string; texto: string; negocio: string; whatsapp: string; activo: boolean; };

export default function BannerAnuncios() {
  const [banners, setBanners] = useState<Banner[]>([
    { id: "1", texto: "Anúnciate aquí", negocio: "Tu negocio aquí", whatsapp: "4491883244", activo: true }
  ]);
  const [i, setI] = useState(0);

  useEffect(() => {
    fetch("/data/banners.json").then(r=>r.ok?r.json():null).then(d=>{
      if(d && d.length>0) setBanners(d.filter((b:Banner)=>b.activo));
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    if(banners.length<=1) return;
    const t=setInterval(()=>setI(v=>(v+1)%banners.length),3000);
    return ()=>clearInterval(t);
  },[banners.length]);

  const b=banners[i];
  if(!b) return null;

  return (
    <div className="w-full bg-black text-white sticky top-0 z-50">
      <div onClick={()=>window.open(`https://wa.me/52${b.whatsapp}?text=Vi tu anuncio ${b.negocio} en Bazar Los Cuates`,"_blank")}
        className="flex justify-center items-center gap-2 py-2 px-4 font-bold cursor-pointer hover:bg-yellow-400 hover:text-black">
        <span className="bg-yellow-400 text-black px-2 rounded text-xs">ANUNCIO</span>
        <span>✨ {b.texto} - {b.negocio} ✨</span>
      </div>
    </div>
  );
}
