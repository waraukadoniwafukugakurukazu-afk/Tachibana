
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=(s="")=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
async function api(path, options={}) {
  const res=await fetch(path,{credentials:"same-origin",...options});
  if(!res.ok){let msg="通信に失敗しました";try{msg=(await res.json()).error||msg}catch{};throw new Error(msg)}
  const ct=res.headers.get("content-type")||""; return ct.includes("application/json")?res.json():res;
}
function imageHTML(key,alt){return key?`<img src="/media/${encodeURIComponent(key)}" alt="${esc(alt)}">`:`<span>管理画面から画像を追加できます</span>`}
function searchAndScroll(input, selector){
  const q=$(input).value.trim().toLowerCase(); $$(selector).forEach(x=>x.classList.remove("hit")); if(!q)return;
  const hit=$$(selector).find(x=>x.innerText.toLowerCase().includes(q));
  if(!hit)return alert("一致する情報が見つかりませんでした");
  hit.classList.add("hit"); hit.scrollIntoView({behavior:"smooth",block:"center"});
}
