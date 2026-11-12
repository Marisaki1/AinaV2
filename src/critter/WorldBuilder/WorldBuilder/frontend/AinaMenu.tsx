import React, {useEffect,useRef} from "react";
import {Menu} from "lucide-react";
const tools=[["worldbuilder","WorldBuilder"],["combat","Combat"],["initiative","Initiative"],["siege","Siege"],["library","Library & editor"],["sender","Commands"],["roleplay","Roleplay"]];
export function AinaMenu({parent}:{parent?:string}){
  const ref=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{const close=(e:MouseEvent)=>{if(!ref.current?.contains(e.target as Node))ref.current?.removeAttribute("open");};const key=(e:KeyboardEvent)=>{if(e.key==="Escape")ref.current?.removeAttribute("open");};document.addEventListener("click",close);document.addEventListener("keydown",key);return()=>{document.removeEventListener("click",close);document.removeEventListener("keydown",key);};},[]);
  if(!parent)return null;
  return <details className="aina-tools-menu" ref={ref}><summary aria-label="Aina tools"><Menu size={21}/></summary><nav aria-label="Aina tools">{tools.map(([tab,label])=><button key={tab} type="button" aria-current={tab==="worldbuilder"?"page":undefined} onClick={()=>{window.parent.postMessage({type:"aina:navigate",tab},parent);ref.current?.removeAttribute("open");}}>{label}</button>)}</nav></details>;
}
